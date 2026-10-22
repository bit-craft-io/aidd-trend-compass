import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendGroupsApi from "../api/trendGroups";
import { useTrendGroups } from "./useTrendGroups";

vi.mock("../api/trendGroups");

const sampleGroup = { id: 1, name: "成長株" };

describe("useTrendGroups", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trendGroupsApi.fetchTrendGroups).mockResolvedValue([sampleGroup]);
  });

  it("loads groups on mount", async () => {
    const { result } = renderHook(() => useTrendGroups());

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    expect(result.current.groups[0].name).toBe("成長株");
  });

  it("create calls api and reloads groups", async () => {
    vi.mocked(trendGroupsApi.createTrendGroup).mockResolvedValue(sampleGroup);
    const { result } = renderHook(() => useTrendGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    await act(async () => {
      await result.current.create("成長株");
    });

    expect(trendGroupsApi.createTrendGroup).toHaveBeenCalledWith("成長株");
    expect(trendGroupsApi.fetchTrendGroups).toHaveBeenCalledTimes(2);
  });

  it("remove calls api and reloads groups", async () => {
    vi.mocked(trendGroupsApi.deleteTrendGroup).mockResolvedValue({ deleted: true });
    const { result } = renderHook(() => useTrendGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    await act(async () => {
      await result.current.remove(1);
    });

    expect(trendGroupsApi.deleteTrendGroup).toHaveBeenCalledWith(1);
    expect(trendGroupsApi.fetchTrendGroups).toHaveBeenCalledTimes(2);
  });

  it("create sets error message on failure", async () => {
    vi.mocked(trendGroupsApi.createTrendGroup).mockRejectedValue(new Error("作成に失敗しました"));
    const { result } = renderHook(() => useTrendGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    await act(async () => {
      await expect(result.current.create("x")).rejects.toThrow("作成に失敗しました");
    });

    expect(result.current.error).toBe("作成に失敗しました");
  });

  it("create rethrows the error after setting error state, so callers can tell failure from success", async () => {
    vi.mocked(trendGroupsApi.createTrendGroup).mockRejectedValue(new Error("作成に失敗しました"));
    const { result } = renderHook(() => useTrendGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create("x");
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("作成に失敗しました");
  });
});
