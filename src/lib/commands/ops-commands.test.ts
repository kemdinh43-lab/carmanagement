import { describe, expect, it } from "vitest";
import { canRunCommand, commandCatalog } from "./ops-commands";

describe("ops command catalog", () => {
  it("keeps command rpc names stable", () => {
    expect(commandCatalog["dispatch.assign_vehicle_driver"].rpcName).toBe("assign_vehicle_driver");
    expect(commandCatalog["finance.close_order"].permission).toBe("close_order");
  });

  it("maps role permissions to commands", () => {
    expect(canRunCommand("sale", "order.submit_proposal")).toBe(true);
    expect(canRunCommand("sale", "finance.record_payment")).toBe(false);
    expect(canRunCommand("admin", "master.create_vehicle")).toBe(true);
  });
});
