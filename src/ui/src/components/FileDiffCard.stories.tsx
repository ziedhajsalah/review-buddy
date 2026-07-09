import type { Meta, StoryObj } from "@storybook/react-vite";
import { DEFAULT_SETTINGS, fakeResolvedFile } from "../stories/fixtures.ts";
import { FileDiffCard } from "./FileDiffCard.tsx";

const meta = {
  title: "Components/FileDiffCard",
  component: FileDiffCard,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof FileDiffCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: fakeResolvedFile,
    settings: DEFAULT_SETTINGS,
    viewed: false,
    onToggleViewed: () => {},
  },
};

export const Viewed: Story = {
  args: {
    file: fakeResolvedFile,
    settings: DEFAULT_SETTINGS,
    viewed: true,
    onToggleViewed: () => {},
  },
};

export const Binary: Story = {
  args: {
    file: { ...fakeResolvedFile, binary: true, hunks: [] },
    settings: DEFAULT_SETTINGS,
    viewed: false,
    onToggleViewed: () => {},
  },
};
