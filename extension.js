import Gio from "gi://Gio";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { Preferences } from "./lib/preferences.js";
import { logError } from "./lib/utils.js";

const PowerManagerInterface = `
<node>
  <interface name="org.freedesktop.UPower">
    <property name="OnBattery" type="b" access="read"/>
  </interface>
</node>`;

const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(PowerManagerInterface);

export default class AutoScreenBrightnessNGExtension extends Extension {
    enable() {
        this._preferences = new Preferences(this.getSettings());
        this._preferences.connectObject(
            `notify::brightnessOnAc`,
            () => {
                if (this._powerManagerProxy?.OnBattery === false) {
                    this._updateScreenBrightness();
                }
            },
            this,
        );
        this._preferences.connectObject(
            `notify::brightnessOnBattery`,
            () => {
                if (this._powerManagerProxy?.OnBattery === true) {
                    this._updateScreenBrightness();
                }
            },
            this,
        );

        this._powerManagerProxy = new PowerManagerProxy(
            Gio.DBus.system,
            `org.freedesktop.UPower`,
            `/org/freedesktop/UPower`,
            (proxy, error) => {
                if (error) {
                    logError(
                        "Failed to connect to UPower D-Bus interface",
                        error,
                    );
                } else {
                    // Update brightness immediately after successful connection
                    this._updateScreenBrightness();
                }
            },
        );
        this._powerManagerProxy.connectObject(
            `g-properties-changed`,
            (...[, properties]) => {
                if (properties.lookup_value(`OnBattery`, null) !== null) {
                    this._updateScreenBrightness();
                }
            },
            this,
        );
    }

    disable() {
        this._powerManagerProxy.disconnectObject(this);
        delete this._powerManagerProxy;

        this._preferences.disconnectObject(this);
        this._preferences.destroy();
        delete this._preferences;
    }

    _updateScreenBrightness() {
        if (this._powerManagerProxy.OnBattery === null) {
            return;
        }

        const brightnessManager = Main.brightnessManager;
        if (!brightnessManager) {
            logError("BrightnessManager not available");
            return;
        }

        // Get target brightness value (convert 0-100 to 0.0-1.0)
        const targetBrightness = this._powerManagerProxy.OnBattery
            ? this._preferences.brightnessOnBattery / 100.0
            : this._preferences.brightnessOnAc / 100.0;

        // Set brightness for all monitors
        const scales = brightnessManager.scales;
        for (const scale of scales) {
            scale.value = targetBrightness;
        }
    }
}
