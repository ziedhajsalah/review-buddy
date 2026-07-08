import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DisplaySettings } from "../../../types/review.ts";
import { DisplaySettingsBar } from "./DisplaySettingsBar.tsx";
import { DEFAULT_SETTINGS } from "../stories/fixtures.ts";

const meta = {
  title: "Components/DisplaySettingsBar",
  component: DisplaySettingsBar,
  tags: ["autodocs"],
} satisfies Meta<typeof DisplaySettingsBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    settings: DEFAULT_SETTINGS,
    update: () => {},
  },
  render: function Interactive() {
    const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_SETTINGS);
    const update = (patch: Partial<DisplaySettings>) =>
      setSettings((s) => ({ ...s, ...patch }));
    return <DisplaySettingsBar settings={settings} update={update} />;
  },
};
