import type {
  CustomCommandDetailItem,
  DeleteCustomCommandInput,
  ListCustomCommandsInput,
  SaveCustomCommandInput,
} from "@shared/contracts/customCommand"

export const customCommandApi = {
  list: (input?: ListCustomCommandsInput): Promise<CustomCommandDetailItem[]> =>
    window.api.customCommand.list(input),
  save: (
    input: SaveCustomCommandInput,
  ): Promise<{ ok: true; item: CustomCommandDetailItem } | { ok: false; error: string }> =>
    window.api.customCommand.save(input),
  delete: (input: DeleteCustomCommandInput): Promise<{ ok: true } | { ok: false; error: string }> =>
    window.api.customCommand.delete(input),
}
