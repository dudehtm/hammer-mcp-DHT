import { describe, expect, it } from "vitest";
import { surveyL4d2Setup } from "../src/l4d2/setup.js";
import { inspectL4d2AddonInfo, inspectL4d2Mission } from "../src/l4d2/mission.js";

const vmf = (classes: string[]): string =>
  `world\n{\n"id" "1"\n"classname" "worldspawn"\n}\n` +
  classes.map((classname, index) =>
    `entity\n{\n"id" "${index + 2}"\n"classname" "${classname}"\n}\n`,
  ).join("");

describe("L4D2 setup survey", () => {
  it("counts real entity classes and keeps prototype checks advisory", () => {
    const result = surveyL4d2Setup(vmf(["info_player_start", "info_director"]), "prototype");
    expect(result.entityCount).toBe(2);
    expect(result.markers.info_player_start).toBe(1);
    expect(result.markers.info_director).toBe(1);
    expect(result.review).toEqual([]);
  });

  it("asks for a chapter transition without declaring the map broken", () => {
    const result = surveyL4d2Setup(vmf(["info_player_start", "info_director"]), "chapter");
    expect(result.markers.info_changelevel).toBe(0);
    expect(result.review).toEqual([expect.stringContaining("info_changelevel")]);
    expect(surveyL4d2Setup(vmf(["info_changelevel"]), "chapter").review)
      .not.toContain(expect.stringContaining("No info_changelevel"));
  });

  it("tracks finale markers independently of chapter transitions", () => {
    const result = surveyL4d2Setup(vmf(["trigger_finale", "info_director"]), "finale");
    expect(result.markers.trigger_finale).toBe(1);
    expect(result.review.join(" ")).not.toContain("No trigger_finale");
    expect(result.review.join(" ")).toContain("info_player_start");
  });

  it("marks an instance-based inventory as incomplete", () => {
    const result = surveyL4d2Setup(vmf(["func_instance", "info_director"]), "prototype");
    expect(result.review.join(" ")).toContain("func_instance");
  });
});

describe("L4D2 mission structure", () => {
  const mission = `"mission" { "Name" "sample" "Version" "1" "modes" { "coop" {
    "1" { "Map" "chapter_a" } "2" { "Map" "chapter_b" }
  } } }`;

  it("reports the exact missing BSP reference by mode and chapter", () => {
    const result = inspectL4d2Mission(mission, (name) => name === "chapter_a");
    expect(result.maps).toEqual([
      { mode: "coop", chapter: 1, map: "chapter_a", present: true },
      { mode: "coop", chapter: 2, map: "chapter_b", present: false },
    ]);
    expect(result.errors).toEqual([expect.stringContaining("chapter_b.bsp")]);
  });

  it("refuses a path in Map instead of treating it as a basename", () => {
    const result = inspectL4d2Mission(mission.replace("chapter_b", "../other"));
    expect(result.errors.join(" ")).toContain("Invalid Map name");
  });

  it("checks the L4D2 AppID in add-on metadata", () => {
    expect(inspectL4d2AddonInfo('"AddonInfo" { "addonSteamAppID" "550" "addontitle" "Test" }')).toEqual([]);
    expect(inspectL4d2AddonInfo('"AddonInfo" { "addonSteamAppID" "500" "addontitle" "Test" }'))
      .toEqual([expect.stringContaining("550")]);
  });
});
