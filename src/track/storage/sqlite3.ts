import _debug from "debug";
const debug = _debug("shougun:sqlite");

import sqlite from "better-sqlite3";

import { IStorage, IViewedInformation } from "../persistent";

const SchemaVersion = 1;

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
            new sqlite("", { memory: true}),
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

    public async loadLastViewedForSeries(seriesId: string): Promise<IViewedInformation | null> {
        const result = this.prepare(`
            SELECT * FROM ViewedInformation
            WHERE seriesId = ?
            ORDER BY lastViewedTimestamp DESC
        `).get(seriesId);

        return unpackInfo(result);
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
        `).run(Object.assign({
            seriesId: undefined,
        }, info));
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
            SELECT * FROM ViewedInformation
            GROUP BY COALESCE(seriesId, id)
            ORDER BY lastViewedTimestamp DESC
            LIMIT 20
        `).all();

        for (const result of results) {
            const unpacked = unpackInfo(result);
            if (unpacked) {
                yield unpacked;
            }
        }
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
            this.setVersion(SchemaVersion);
            break;

        case SchemaVersion:
            // up to date!
            return;

        default:
            throw new Error("");
        }
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
