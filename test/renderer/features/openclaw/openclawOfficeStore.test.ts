import { beforeEach, describe, expect, it } from "vitest"
import { useOpenClawOfficeStore } from "@/features/openclaw/openclawOfficeStore"

describe("useOpenClawOfficeStore", () => {
  beforeEach(() => {
    useOpenClawOfficeStore.setState({
      selectedInstanceId: null,
      selectedAgentIds: [],
      pendingDispatch: null,
    })
  })

  it("切换办公区时默认选中首个员工", () => {
    useOpenClawOfficeStore.getState().selectOffice("local", "lily")

    expect(useOpenClawOfficeStore.getState().selectedInstanceId).toBe("local")
    expect(useOpenClawOfficeStore.getState().selectedAgentIds).toEqual(["lily"])
  })

  it("切换办公区未指定员工时清空选中集合", () => {
    useOpenClawOfficeStore.getState().selectOffice("local", "lily")
    useOpenClawOfficeStore.getState().selectOffice("remote")

    expect(useOpenClawOfficeStore.getState().selectedInstanceId).toBe("remote")
    expect(useOpenClawOfficeStore.getState().selectedAgentIds).toEqual([])
  })

  it("默认选择覆盖为单选，追加选择可增删单个员工", () => {
    const store = useOpenClawOfficeStore.getState()
    store.selectAgent("lily")
    store.selectAgent("amy")
    expect(useOpenClawOfficeStore.getState().selectedAgentIds).toEqual(["amy"])

    useOpenClawOfficeStore.getState().selectAgent("lily", { additive: true })
    expect(useOpenClawOfficeStore.getState().selectedAgentIds).toEqual(["amy", "lily"])

    useOpenClawOfficeStore.getState().selectAgent("amy", { additive: true })
    expect(useOpenClawOfficeStore.getState().selectedAgentIds).toEqual(["lily"])
  })

  it("派发请求只能被消费一次", () => {
    const dispatch = { instanceId: "local", agentId: "lily", task: "写一个测试" }

    useOpenClawOfficeStore.getState().requestDispatch(dispatch)

    expect(useOpenClawOfficeStore.getState().consumePendingDispatch()).toEqual(dispatch)
    expect(useOpenClawOfficeStore.getState().consumePendingDispatch()).toBeNull()
  })
})
