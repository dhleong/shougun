shougun
=======

*Take command of your media*

## What?

shougun is a programmable, extensible, embeddable, media management framework.
That's a lot of adjectives, but it's intended for a lot of uses.

My primary use is integration with a voice assistant and a Chromecast, which
looks like this:

```typescript
// ShougunBuilder is a convenient, typesafe, fluent interface for building a
// Shougun instance with whatever features you desire.
const shougun = await new ShougunBuilder()

    // track episode watch progress in a sqlite db
    .trackInSqlite("shougun.db")

    // call this multiple times to scan multiple local folders
    .scanFolder("~/Movies")

    // use a phonetic matcher for queries, suitable for use with voice assistants
    .matchByPhonetics()

    // play back on a specific chromecast device
    .playOnNamedChromecast("Family Room TV")

    // construct the instance
    .build();

onPlaybackRequest(async (query: string) => {

    // find the best match to the query from all configured sources
    const found = await shougun.findMedia(query);
    if (!found) {
        throw new Error("no match");
    }

    // play the found media on the configured output surface (a Chromecast).
    // if `found` appears to be a TV series, Shougun will automatically resume
    // wherever you left off
    console.log("Playing", found);
    await shougun.play(found);
});
```
