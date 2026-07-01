import { Notice, Plugin } from "obsidian";

import { registerAutoConvert } from "./src/autoConvert";
import { registerVisualMediaCommands } from "./src/commands";
import { renderVisualMediaLayout } from "./src/renderer";

export interface VisualMediaLayoutSettings {
  autoConvertEnabled: boolean;
}

const DEFAULT_SETTINGS: VisualMediaLayoutSettings = {
  autoConvertEnabled: true,
};

export default class VisualMediaLayoutPlugin extends Plugin {
  settings: VisualMediaLayoutSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor(
      "visual-media-layout",
      (source, el, ctx) => {
        renderVisualMediaLayout({
          app: this.app,
          source,
          containerEl: el,
          context: ctx,
        });
      },
    );

    registerVisualMediaCommands(this, {
      disableAutoConvert: () => this.setAutoConvertEnabled(false),
      enableAutoConvert: () => this.setAutoConvertEnabled(true),
    });
    registerAutoConvert(this, () => this.settings.autoConvertEnabled);
    console.log("Visual Media Layout loaded");
  }

  override onunload(): void {
    new Notice("Visual Media Layout unloaded");
  }

  async loadSettings(): Promise<void> {
    const savedSettings = await this.loadData() as Partial<VisualMediaLayoutSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async setAutoConvertEnabled(enabled: boolean): Promise<void> {
    this.settings.autoConvertEnabled = enabled;
    await this.saveSettings();
  }
}
