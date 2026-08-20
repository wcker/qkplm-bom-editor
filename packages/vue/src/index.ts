import {
  createBomEditorComponent,
  type BomEditorComponent,
  type BomEditorComponentProps,
  type BomEditorComponentUpdate,
} from '@qkplm/bom-editor';
import type { BomFields, BomResult } from '@qkplm/bom-editor';

/**
 * Framework-neutral handle used by a Vue `onMounted`/`onBeforeUnmount` bridge.
 * It deliberately contains no Vue refs or watchers, keeping Vue optional for
 * SSR and allowing the same lifecycle contract to be tested in isolation.
 */
export interface BomVueEditorAdapter<
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

/** Creates the Vue lifecycle bridge without adding Vue to the Core runtime. */
export function createBomEditorVueAdapter<
  TFields extends BomFields = BomFields,
>(
  props: Readonly<BomEditorComponentProps<TFields>>,
): BomVueEditorAdapter<TFields> {
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
