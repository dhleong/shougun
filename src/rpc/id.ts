import { machineId } from "node-machine-id";
import { v5 as uuid} from "uuid";

const NAMESPACE = "778b1b44-c3aa-4274-8e54-f505b0d4dda3";

export async function generateMachineUuid() {
    return uuid(await machineId(), NAMESPACE);
}
