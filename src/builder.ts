import { IDiscovery } from "./discover/base";
import { CompositeDiscovery } from "./discover/composite";
import { LocalDiscovery } from "./discover/local";
import { IPlayer } from "./playback/player";
import { ChromecastPlayer } from "./playback/player/chromecast";
import { Shougun } from "./shougun";

export class ShougunBuilder {

    private discoveries: IDiscovery[] = [];

    private player: IPlayer | undefined;

    public scanFolder(path: string) {
        this.discoveries.push(new LocalDiscovery(path));
        return this;
    }

    public playOnNamedChromecast(deviceName: string) {
        if (this.player) {
            // TODO does it make sense to ever have >1?
            throw new Error("Only one Player allowed");
        }

        this.player = ChromecastPlayer.forNamedDevice(deviceName);
        return this;
    }

    public async build() {
        if (!this.discoveries.length) {
            throw new Error("No discovery method provided");
        }

        if (!this.player) {
            throw new Error("No playback method provided");
        }

        const discovery = this.discoveries.length === 1
            ? this.discoveries[0]
            : CompositeDiscovery.create(...this.discoveries);

        return Shougun.create(
            discovery,
            this.player,
        );
    }
}
