export interface DeviceRegisterMessage {
  type: 'register';
  deviceId: string;
  token: string;
  protocol?: number;
  label?: string;
  capabilities?: {
    tools?: boolean;
  };
  tools?: any[];
}

export interface DeviceRegisteredAck {
  type: 'registered';
  deviceId: string;
}

export interface DeviceAuthError {
  type: 'auth_error';
  message: string;
}

export function isRegisterMessage(value: any): value is DeviceRegisterMessage {
  return Boolean(
    value &&
    value.type === 'register' &&
    typeof value.deviceId === 'string' &&
    value.deviceId.length > 0 &&
    typeof value.token === 'string' &&
    value.token.length > 0
  );
}
