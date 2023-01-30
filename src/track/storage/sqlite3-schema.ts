import createDebug from "debug";

import type Sqlite from "better-sqlite3";

const debug = createDebug("shougun:sqlite:schema");

const SchemaVersion = 4;

interface IMigration {
    description: string;
    perform(db: Sqlite.Database): void;
}

const migrations: { [key: number]: IMigration } = {
    0: {
        description: "Create initial DB",
        perform(db) {
            db.exec(`
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
        },
    },

    1: {
        description: "Support loan tracking",
        perform(db) {
            db.exec(`
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
        },
    },

    2: {
        description: "Support series prefs",
        perform(db) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS SeriesPrefs (
                    seriesId STRING PRIMARY KEY NOT NULL,
                    prefs STRING
                );
            `);
        },
    },

    3: {
        description: "Support tracking external media",
        perform(db) {
            db.exec(`
                ALTER TABLE ViewedInformation
                ADD COLUMN mediaType INTEGER;
            `);
        },
    },
};

interface IMigrationResult {
    initialVersion: number;
    resultVersion: number;
}

function getVersion(db: Sqlite.Database) {
    return db.pragma("user_version", { simple: true }) as number;
}

function setVersion(db: Sqlite.Database, newVersion: number) {
    db.pragma(`user_version = ${newVersion}`, {
        simple: true,
    });
}

export function performMigrations(db: Sqlite.Database): IMigrationResult {
    const initialVersion = getVersion(db);
    debug(`Opened db version ${initialVersion}`);

    let resultVersion = initialVersion;
    if (initialVersion === SchemaVersion) {
        // Nothing to do!
        return { initialVersion, resultVersion };
    }

    // Gather the migrations up front to ensure we have a valid path
    const migrationsToPerform: Array<[number, IMigration]> = [];
    for (; resultVersion < SchemaVersion; ++resultVersion) {
        const migration = migrations[resultVersion];
        if (migration == null) {
            throw new Error(
                `ERROR!: No path from ${resultVersion} to ${SchemaVersion}`,
            );
        }
        migrationsToPerform.push([resultVersion, migration]);
    }

    // Now, perform the migrations
    for (const [fromVersion, migration] of migrationsToPerform) {
        debug(`Migrating from ${fromVersion}: ${migration.description}`);
        migration.perform(db);
    }

    setVersion(db, resultVersion);

    return { initialVersion, resultVersion };
}
