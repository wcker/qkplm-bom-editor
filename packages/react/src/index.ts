import {
  createBomEditorComponent,
  type BomEditorComponent,
  type BomEditorComponentProps,
  type BomEditorComponentUpdate,
} from '@qkplm/bom-editor';
import type { BomFields, BomResult } from '@qkplm/bom-editor';

/** Stable bridge returned by a React ref/effect integration. */
export interface BomReactEditorAdapter<
  TFields extends BomFields = BomFields,
> {
  readonly component: BomEditorComponent<TFields>;
  readonly instanceId: string;
  readonly ready: Promise<BomResult<void>>;
  mount(container: HTMLElement): Promise<BomResult<void>>;
  update(
    input: Readonly<BomEditorComponentUpdate<TFields>>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<BomResult<void>>;
  unmount(): BomResult<void>;
  destroy(): void;
}

/**
 * Creates a StrictMode-safe React bridge. Repeated destroy calls are ignored;
 * React effects remain responsible for deciding when to mount/unmount.
 */
export function createBomEditorReactAdapter<
  TFields extends BomFields = BomFields,
>(
  props: Readonly<BomEditorComponentProps<TFields>>,
): BomReactEditorAdapter<TFields> {
  const component = createBomEditorComponent(props);
  let destroyed = false;
  return Object.freeze({
    component,
    instanceId: component.instanceId,
    ready: component.ready,
    mount: (container: HTMLElement): Promise<BomResult<void>> =>
      component.mount(container),
    update: (
      input: Readonly<BomEditorComponentUpdate<TFields>>,
      options: { readonly signal?: AbortSignal } = {},
    ): Promise<BomResult<void>> => component.update(input, options),
    unmount: (): BomResult<void> => component.unmount(),
    destroy: (): void => {
      if (destroyed) return;
      destroyed = true;
      component.destroy();
    },
  });
}
