import type { ModelPricing } from "@shared/contracts/usage"
import type { FetchedProviderModel } from "@shared/settings"
import type React from "react"
import type {
  ModelProvider,
  ModelProviderModel,
  ModelProviderSettingsData,
} from "@/features/settings/types"

export interface ModelProviderSettingsProps {
  settings: ModelProviderSettingsData
  setSettings: React.Dispatch<React.SetStateAction<ModelProviderSettingsData | null>>
  onRegisterAddProvider?: (fn: () => void) => void
  onAddProvider?: () => void
  onDeleteProvider?: (providerId: string) => void
}

export type UpdateProviderFn = (
  providerId: string,
  updater: (provider: ModelProvider) => ModelProvider,
) => void

export type ProviderMenuState = {
  providerKey: string
  providerName: string
  isEnabled: boolean
  x: number
  y: number
}

export type ModelProviderMenuProps = {
  isOpen: boolean
  providerName: string
  isEnabled: boolean
  x: number
  y: number
  onToggleEnabled: (enabled: boolean) => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}

export type ProviderNavProps = {
  providers: Record<string, ModelProvider>
  selectedProviderId: string
  enabledProviders: string[]
  onSelect: (providerKey: string) => void
  onToggleEnabled: (providerKey: string, enabled: boolean) => void
  onOpenContextMenu: (
    providerKey: string,
    providerName: string,
    isEnabled: boolean,
    x: number,
    y: number,
  ) => void
}

export type ProviderBasicFieldsProps = {
  providerId: string
  provider: ModelProvider
  updateProvider: UpdateProviderFn
  invalidateFetchedModels: (providerId: string) => void
}

export type FetchedModelsContentProps = {
  models: FetchedProviderModel[]
  query: string
  onQueryChange: (value: string) => void
  onApply: (model: FetchedProviderModel) => void
}

export type ModelLimitFieldsProps = {
  providerId: string
  modelKey: string
  model: ModelProviderModel
  updateProvider: UpdateProviderFn
}

export type ModelPricingFieldsProps = {
  modelKey: string
  model: ModelProviderModel
  updateModelPricing: (modelKey: string, field: keyof ModelPricing, rawValue: string) => void
}

export type ModelThinkingVariantsProps = {
  providerId: string
  modelKey: string
  model: ModelProviderModel
  updateProvider: UpdateProviderFn
}

export type ProviderModelRowProps = {
  providerId: string
  modelKey: string
  model: ModelProviderModel
  isExpanded: boolean
  onToggleExpanded: () => void
  updateProvider: UpdateProviderFn
  updateModelPricing: (modelKey: string, field: keyof ModelPricing, rawValue: string) => void
  onDuplicateModel: () => void
  fetchedModels?: FetchedProviderModel[]
  modelListQuery: string
  onModelListQueryChange: (value: string) => void
  onApplyFetchedModel: (fetched: FetchedProviderModel) => void
}
