import { ShortMemo } from '../common/short-memo';

/** El Live y el fixture del club se comparten unos segundos entre quienes los miran a la vez. */
export const clubLiveMemo = new ShortMemo(4_000);
export const clubFeedMemo = new ShortMemo(15_000);
