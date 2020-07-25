import _debug from "debug";
const debug = _debug("shougun:sqlite");

import sqlite from "better-sqlite3";

import { ILoanCreate, ILoanData } from "../base";
import { IStorage, IViewedInformation } from "../persistent";
import { IMediaPrefs } from "../../model";

const SchemaVersion = 2;

function unpackInfo(result: any): IViewedInformation | null {
    if (result === undefined) return null;

    if (result.seriesId === null) {
        delete result.seriesId;
    }
    return result;
}

export class Sqlite3Storage implements IStorage {
    public static forFile(filePath: string) {
        return new Sqlite3Storage(
            new sqlite(filePath),
        );
    }

    public static inMemory() {
        return new Sqlite3Storage(
            new sqlite(":memory:"),
        );
    }

    private hasPrepared = false;
    private statementsCache: {[key: string]: sqlite.Statement} = {};

    constructor(
        private db: sqlite.Database,
    ) { }

    public close() {
        this.db.close();
        this.statementsCache = {};
    }

    public async createLoan(track: ILoanCreate) {
        this.prepare(`
            INSERT OR IGNORE INTO Loans (
                token,
                serverId,
                createdTimestamp
            ) VALUES (
                :token,
                :serverId,
                :createdTimestamp
            )
        `).run({
            createdTimestamp: new Date().getTime(),
            ...track,
        });
    }

    public async loadLastViewedForSeries(seriesId: string): Promise<IViewedInformation | null> {
        const result = this.prepare(`
            SELECT * FROM ViewedInformation
            WHERE seriesId = ?
            ORDER BY lastViewedTimestamp DESC
        `).get(seriesId);

        return unpackInfo(result);
    }

    public async markBorrowReturned(
        tokens: string[],
    ): Promise<void> {
        this.markBorrowReturnedBlocking(tokens);
    }

    public async retrieveBorrowed(): Promise<ILoanData> {
        const loanRows = this.prepare(`
            SELECT token, serverId, createdTimestamp FROM Loans
            ORDER BY createdTimestamp ASC;
        `).iterate();

        let oldestViewed: number = -1;
        const tokens: ILoanData["tokens"] = [];
        for (const { token, serverId, createdTimestamp } of loanRows) {
            if (oldestViewed === -1) {
                oldestViewed = createdTimestamp;
            }
            tokens.push({ token, serverId });
        }

        const viewedInformation: IViewedInformation[] = [];

        if (oldestViewed !== -1) {
            const viewedRows = this.prepare(`
                SELECT * FROM ViewedInformation
                WHERE lastViewedTimestamp >= :oldestViewed
                ORDER BY lastViewedTimestamp ASC
            `).iterate({
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
        } else if (!tokens.length) {
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
        this.prepare(`
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
        `).run({
            seriesId: undefined,
            ...info,
        });
    }

    public async loadById(id: string): Promise<IViewedInformation | null> {
        const result = this.prepare(`
            SELECT * FROM ViewedInformation
            WHERE id = ?
        `).get(id);

        return unpackInfo(result);
    }

    public async *queryRecent() {
        const results = this.prepare(`
            SELECT *
            FROM ViewedInformation
            GROUP BY COALESCE(seriesId, id)
            ORDER BY MAX(lastViewedTimestamp) DESC
            LIMIT 20
        `).all();

        for (const result of results) {
            const unpacked = unpackInfo(result);
            if (unpacked) {
                yield unpacked;
            }
        }
    }

    public loadPrefsForSeries(seriesId: string): IMediaPrefs | null {
        const result = this.prepare(`
            SELECT prefs FROM SeriesPrefs
            WHERE seriesId = ?
        `).get(seriesId);

        if (!result || !result.prefs) {
            return null;
        }

        return JSON.parse(result.prefs);
    }

    public async updatePrefsForSeries(
        seriesId: string,
        prefs: IMediaPrefs,
    ): Promise<IMediaPrefs | null> {
        return this.db.transaction(() => {
            const existing = this.loadPrefsForSeries(seriesId);
            const updated = {
                ...existing,
                ...prefs,
            };

            this.prepare(`
                INSERT OR REPLACE INTO SeriesPrefs (
                    seriesId,
                    prefs
                ) VALUES (:seriesId, :prefs)
            `).run({
                seriesId,
                prefs: JSON.stringify(updated),
            });

            return updated;
        })();
    }

    /**
     * Non-async version that can be used inside transactions
     */
    private markBorrowReturnedBlocking(tokens: string[]) {
        if (!tokens.length) {
            // nothing to do
            return;
        }

        const params = tokens.map(it => "?").join(", ");
        this.db.transaction(() => {
            const result = this.prepare(`
                DELETE FROM Loans
                WHERE token IN (${params})
            `).run(...tokens);

            if (result.changes !== tokens.length) {
                throw new Error(`Invalid tokens provided`);
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

        const version = this.getVersion();
        debug("opened db version", version);

        switch (version) {
        case 0:
            debug("create initial DB");
            this.createInitialDb();
            break;

        case 1:
            debug(`migrate from ${version} to 2`);
            this.createLoansTable();

            // fall through:

        case 2:
            debug(`migrate from ${version} to ${SchemaVersion}`);
            this.createSeriesPrefsTable();

            // fall through:

        case SchemaVersion:
            // up to date!
            return;

        default:
            throw new Error("");
        }

        debug(`set version to ${SchemaVersion}`);
        this.setVersion(SchemaVersion);
    }

    private createInitialDb() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ViewedInformation (
                id STRING PRIMARY KEY NOT NULL,
                seriesId STRING,
                title STRING NOT NULL,
                lastViewedTimestamp INTEGER,
                resumeTimeSeconds REAL,
                videoDurationSeconds REAL
            );

            CREATE INDEX IF NOT EXISTS ViewedInformation_bySeriesId
            ON ViewedInformation (
                seriesId
            );
        `);
        this.createLoansTable();
        this.createSeriesPrefsTable();
    }

    private createLoansTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS Loans (
                token STRING PRIMARY KEY NOT NULL,
                serverId STRING,
                createdTimestamp INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS Loans_byCreatedTimestamp
            ON Loans (
                createdTimestamp
            );
        `);
    }

    private createSeriesPrefsTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS SeriesPrefs (
                seriesId STRING PRIMARY KEY NOT NULL,
                prefs STRING
            );
        `);
    }

    private getVersion() {
        return this.db.pragma("user_version", { simple: true }) as number;
    }

    private setVersion(newVersion: number) {
        this.db.pragma(`user_version = ${newVersion}`, {
            simple: true,
        });
    }

}
