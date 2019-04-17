import { IDiscovery } from "./discover/base";
import { CompositeDiscovery } from "./discover/composite";
import { LocalDiscovery } from "./discover/local";
import { IPlayer } from "./playback/player";
import { ChromecastPlayer } from "./playback/player/chromecast";
import { Shougun } from "./shougun";
import { ITracker } from "./track/base";
import { TracklessTracker } from "./track/trackless";

export class ShougunBuilder {

    private discoveries: IDiscovery[] = [];
    private player: IPlayer | undefined;
    private tracker: ITracker | undefined;

    /*
     * Discovery
     */

    public scanFolder(path: string) {
        this.discoveries.push(new LocalDiscovery(path));
        return this;
    }

    /*
     * Playback
     */

    public playOnNamedChromecast(deviceName: string) {
        if (this.player) {
            // TODO does it make sense to ever have >1?
            throw new Error("Only one Player allowed");
        }

        this.player = ChromecastPlayer.forNamedDevice(deviceName);
        return this;
    }

    /*
     * Tracking
     */

    public dontTrack() {
        this.tracker = new TracklessTracker();
        return this;
    }

    /*
     * Builder
     */

    public async build() {
        if (!this.discoveries.length) {
            throw new Error("No discovery method provided");
        }

        if (!this.player) {
            throw new Error("No playback method provided");
        }

        if (!this.tracker) {
            throw new Error("No watch history tracker provided");
        }

        const discovery = this.discoveries.length === 1
            ? this.discoveries[0]
            : CompositeDiscovery.create(...this.discoveries);

        return Shougun.create(
            discovery,
            this.player,
            this.tracker,
        );
    }
}
