import { environment } from '../environments/environment';

/** @deprecated 直接参照せず `environment.firebase` を優先 */
export const firebaseConfig = environment.firebase;
