import { describe, expect, it } from "vitest";

import {
  applyDetection,
  applyResetBest,
  applySpeed,
  InMemoryCarRepository,
  sortCars,
  type CarRecord,
} from "./carRepository";

describe("InMemoryCarRepository", () => {
  it("creates a car on first detection and increments on repeats", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordDetection({ uid: "AA", at: 100 });
    await repo.recordDetection({ uid: "AA", at: 250 });

    const [car] = await repo.getCars();
    expect(car.uid).toBe("AA");
    expect(car.detections).toBe(2);
    expect(car.firstSeen).toBe(100); // first placement preserved
    expect(car.lastSeen).toBe(250); // bumped to latest
    expect(car.name).toBeNull();
  });

  it("captures a serial at detection and via a late serial without bumping the count", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordDetection({ uid: "AA", at: 1 }); // no serial yet
    await repo.recordSerial("AA", "1102032557");

    const [car] = await repo.getCars();
    expect(car.serial).toBe("1102032557");
    expect(car.detections).toBe(1); // serial must NOT increment detections
  });

  it("tracks best speed monotonically", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordSpeed({ uid: "AA", mph: 12, at: 1 });
    await repo.recordSpeed({ uid: "AA", mph: 8, at: 2 }); // slower, ignored
    await repo.recordSpeed({ uid: "AA", mph: 19, at: 3 });

    const [car] = await repo.getCars();
    expect(car.bestMph).toBe(19);
  });

  it("sets and clears the nickname", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordDetection({ uid: "AA", at: 1 });
    await repo.setName("AA", "Twin Mill");
    expect((await repo.getCars())[0].name).toBe("Twin Mill");

    await repo.setName("AA", null);
    expect((await repo.getCars())[0].name).toBeNull();
  });

  it("returns cars most-recently-seen first", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordDetection({ uid: "OLD", at: 100 });
    await repo.recordDetection({ uid: "NEW", at: 500 });

    expect((await repo.getCars()).map((c) => c.uid)).toEqual(["NEW", "OLD"]);
  });

  it("resetBest() zeroes one car's best speed and keeps the rest of its record", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordDetection({ uid: "AA", serial: "S1", at: 1 });
    await repo.recordSpeed({ uid: "AA", mph: 9, at: 2 });
    await repo.recordSpeed({ uid: "BB", mph: 7, at: 3 });
    await repo.setName("AA", "Rocket");
    await repo.resetBest("AA");
    const cars = await repo.getCars();
    const aa = cars.find((c) => c.uid === "AA")!;
    expect(aa).toMatchObject({ bestMph: 0, name: "Rocket", serial: "S1", detections: 1 });
    expect(cars.find((c) => c.uid === "BB")!.bestMph).toBe(7);
    // A later, slower pass sets a fresh best.
    await repo.recordSpeed({ uid: "AA", mph: 3, at: 4 });
    expect((await repo.getCars()).find((c) => c.uid === "AA")!.bestMph).toBe(3);
  });

  it("clear() forgets the whole garage", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordDetection({ uid: "AA", at: 1 });
    await repo.clear();
    expect(await repo.getCars()).toHaveLength(0);
  });

  it("returns copies, not internal references", async () => {
    const repo = new InMemoryCarRepository();
    await repo.recordDetection({ uid: "AA", at: 1 });
    const cars = await repo.getCars();
    (cars[0] as { detections: number }).detections = 999;
    expect((await repo.getCars())[0].detections).toBe(1);
  });
});

describe("pure car reducers", () => {
  it("applyResetBest only touches the matching car and does not mutate the input", () => {
    const cars = applySpeed(applySpeed([], { uid: "AA", mph: 5, at: 1 }), { uid: "BB", mph: 6, at: 2 });
    const next = applyResetBest(cars, "AA");
    expect(next.find((c) => c.uid === "AA")!.bestMph).toBe(0);
    expect(next.find((c) => c.uid === "BB")!.bestMph).toBe(6);
    expect(cars.find((c) => c.uid === "AA")!.bestMph).toBe(5);
  });

  it("applyDetection does not mutate the input array", () => {
    const before: CarRecord[] = [];
    const after = applyDetection(before, { uid: "AA", at: 1 });
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(1);
  });

  it("applySpeed seeds a new car when the uid is unseen", () => {
    const after = applySpeed([], { uid: "ZZ", mph: 22, at: 9 });
    expect(after[0]).toMatchObject({ uid: "ZZ", bestMph: 22, detections: 0 });
  });

  it("sortCars orders by lastSeen desc", () => {
    const cars = [
      { uid: "a", lastSeen: 1 },
      { uid: "b", lastSeen: 3 },
      { uid: "c", lastSeen: 2 },
    ] as CarRecord[];
    expect(sortCars(cars).map((c) => c.uid)).toEqual(["b", "c", "a"]);
  });
});
