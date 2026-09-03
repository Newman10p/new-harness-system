import { HarnessAction } from "./types";
export interface UsbDeviceInfo {
    bus?: string;
    device?: string;
    id?: string;
    description?: string;
}
declare class DeviceUsbListAction implements HarnessAction {
    name: string;
    description: string;
    run(_input: unknown): Promise<{
        devices: UsbDeviceInfo[];
    }>;
}
declare class DeviceUsbInfoAction implements HarnessAction {
    name: string;
    description: string;
    run(_input: unknown): Promise<{
        info: string;
    }>;
}
declare class DeviceRemoteCallAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        status: string;
        data?: unknown;
    }>;
}
export declare const deviceUsbListAction: DeviceUsbListAction;
export declare const deviceUsbInfoAction: DeviceUsbInfoAction;
export declare const deviceRemoteCallAction: DeviceRemoteCallAction;
export declare function registerDeviceActions(): void;
export {};
//# sourceMappingURL=device.d.ts.map