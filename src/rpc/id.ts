import { machineId } from "node-machine-id";
import uuid from "uuid/v5";

const NAMESPACE = "778b1b44-c3aa-4274-8e54-f505b0d4dda3";

export async function generateMachineUuid() {
    return uuid(await machineId(), NAMESPACE);
}
