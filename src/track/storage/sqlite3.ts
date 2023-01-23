import _debug from "debug";

import Sqlite from "better-sqlite3";

import { ILoanCreate, ILoanData } from "../base";
import {
    DEFAULT_RECENTS_LIMIT,
    IStorage,
    IViewedInformation,
} from "../persistent";
import { IMediaPrefs } from "../../model";
import { performMigrations } from "./sqlite3-schema";

const debug = _debug("shougun:sqlite");

function unpackInfo(info: any): IViewedInformation | null {
    if (info == null) return null;

    if (info.seriesId == null) {
        const result = { ...info };
        delete result.seriesId;
        return result;
    }

    return info;
}

export class Sqlite3Storage implements IStorage {
    public static forFile(filePath: string) {
        return new Sqlite3Storage(new Sqlite(filePath));
    }

    public static inMemory() {
        return new Sqlite3Storage(new Sqlite(":memory:"));
    }

    private hasPrepared = false;
    private statementsCache: { [key: string]: Sqlite.Statement } = {};

    constructor(private db: Sqlite.Database) {}

    public close() {
        this.db.close();
        this.statementsCache = {};
    }

    public async createLoan(track: ILoanCreate) {
        this.prepare(
            `
            INSERT OR IGNORE INTO Loans (
                token,
                serverId,
                createdTimestamp
            ) VALUES (
                :token,
                :serverId,
                :createdTimestamp
            )
        `,
        ).run({
            createdTimestamp: new Date().getTime(),
            ...track,
        });
    }

    public async loadLastViewedForSeries(
        seriesId: string,
    ): Promise<IViewedInformation | null> {
        const result = this.prepare(
            `
            SELECT * FROM ViewedInformation
            WHERE seriesId = ?
            ORDER BY lastViewedTimestamp DESC
        `,
        ).get(seriesId);

        return unpackInfo(result);
    }

    public async markBorrowReturned(tokens: string[]): Promise<void> {
        this.markBorrowReturnedBlocking(tokens);
    }

    public async retrieveBorrowed(): Promise<ILoanData> {
        const loanRows = this.prepare(
            `
            SELECT token, serverId, createdTimestamp FROM Loans
            ORDER BY createdTimestamp ASC;
        `,
        ).iterate();

        let oldestViewed = -1;
        const tokens: ILoanData["tokens"] = [];
        for (const { token, serverId, createdTimestamp } of loanRows) {
            if (oldestViewed === -1) {
                oldestViewed = createdTimestamp;
            }
            tokens.push({ token, serverId });
        }

        const viewedInformation: IViewedInformation[] = [];

        if (oldestViewed !== -1) {
            const viewedRows = this.prepare(
                `
                SELECT * FROM ViewedInformation
                WHERE lastViewedTimestamp >= :oldestViewed
                ORDER BY lastViewedTimestamp ASC
            `,
            ).iterate({
                oldestViewed,
            });

            for (const row of viewedRows) {
                viewedInformation.push(row);
            }
        }

        return {
            tokens,
            viewedInformation,
        };
    }

    public async returnBorrowed(
        tokens: string[],
        viewedInformation: IViewedInformation[],
    ) {
        if (!tokens.length && !viewedInformation.length) {
            debug("Nothing provided; skipping returnBorrowed");
            return;
        }
        if (!tokens.length) {
            throw new Error("No tokens provided");
        }

        this.db.transaction(() => {
            for (const info of viewedInformation) {
                this.save(info);
            }

            this.markBorrowReturnedBlocking(tokens);
        })();
    }

    public async save(info: IViewedInformation): Promise<void> {
        this.prepare(
            `
            INSERT OR REPLACE INTO ViewedInformation (
                id,
                seriesId,
                title,
                lastViewedTimestamp,
                resumeTimeSeconds,
                videoDurationSeconds
            ) VALUES (
                :id, :seriesId, :title,
                :lastViewedTimestamp,
                :resumeTimeSeconds,
                :videoDurationSeconds
            )
        `,
        ).run({
            seriesId: undefined,
            ...info,
        });
    }

    public async loadById(id: string): Promise<IViewedInformation | null> {
        const result = this.prepare(
            `
            SELECT * FROM ViewedInformation
            WHERE id = ?
        `,
        ).get(id);

        return unpackInfo(result);
    }

    public async *queryRecent({
        limit = DEFAULT_RECENTS_LIMIT,
    }: { limit?: number } = {}) {
        const results = this.prepare(
            `
            SELECT *
            FROM ViewedInformation
            GROUP BY COALESCE(seriesId, id)
            ORDER BY MAX(lastViewedTimestamp) DESC
            LIMIT :limit
        `,
        ).all({ limit });

        for (const result of results) {
            const unpacked = unpackInfo(result);
            if (unpacked) {
                yield unpacked;
            }
        }
    }

    public async deletePrefsForSeries(seriesId: string) {
        this.prepare(
            `
            DELETE FROM SeriesPrefs
            WHERE seriesId = :seriesId
        `,
        ).run({ seriesId });
    }

    public async loadPrefsForSeries(seriesId: string) {
        return this.loadPrefsForSeriesBlocking(seriesId);
    }

    public async updatePrefsForSeries(
        seriesId: string,
        prefs: IMediaPrefs,
    ): Promise<IMediaPrefs> {
        return this.db.transaction(() => {
            const existing = this.loadPrefsForSeriesBlocking(seriesId);
            const updated = {
                ...existing,
                ...prefs,
            };

            this.prepare(
                `
                INSERT OR REPLACE INTO SeriesPrefs (
                    seriesId,
                    prefs
                ) VALUES (:seriesId, :prefs)
            `,
            ).run({
                seriesId,
                prefs: JSON.stringify(updated),
            });

            return updated;
        })();
    }

    private loadPrefsForSeriesBlocking(seriesId: string): IMediaPrefs | null {
        const result = this.prepare(
            `
            SELECT prefs FROM SeriesPrefs
            WHERE seriesId = ?
        `,
        )
            .pluck()
            .get(seriesId);

        if (!result) {
            return null;
        }

        return JSON.parse(result);
    }

    /**
     * Non-async version that can be used inside transactions
     */
    private markBorrowReturnedBlocking(tokens: string[]) {
        if (!tokens.length) {
            // nothing to do
            return;
        }

        const params = tokens.map(() => "?").join(", ");
        this.db.transaction(() => {
            const result = this.prepare(
                `
                DELETE FROM Loans
                WHERE token IN (${params})
            `,
            ).run(...tokens);

            if (result.changes !== tokens.length) {
                throw new Error("Invalid tokens provided");
            }
        })();
    }

    private prepare(statement: string) {
        this.ensureInitialized();

        const existing = this.statementsCache[statement];
        if (existing) return existing;

        const compiled = this.db.prepare(statement);
        this.statementsCache[statement] = compiled;
        return compiled;
    }

    private ensureInitialized() {
        if (this.hasPrepared) return;

        performMigrations(this.db);
        this.hasPrepared = true;
    }
}
