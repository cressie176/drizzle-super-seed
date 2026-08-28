// Stands in for @lobechat/const, which is not published and which the schema modules use only for
// two client side defaults. Both feed $defaultFn, so neither reaches the generated data: the values
// need to be the right shape, not the real ones.
export const DEFAULT_MODEL = 'gpt-4o-mini';

export const DEFAULT_PREFERENCE = {
  guide: { moveSettingsToAvatar: true, topic: true },
  telemetry: null,
  useCmdEnterToSend: false,
};
