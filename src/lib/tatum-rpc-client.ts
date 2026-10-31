import { createGraphqlCompatibilityClient } from './tatum-compatibility';
export { TATUM_MAINNET_GATEWAY, SUI_MAINNET_USDC_TYPE, SUI_NATIVE_TYPE } from './config';
export const createTatumSuiClient = createGraphqlCompatibilityClient;
export const tatumSuiClient = createTatumSuiClient();
