/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export interface FolderEmoji {
    name: string;
    id?: string;
    animated?: boolean;
}

export interface Folder {
    id: string;
    name: string;
    channels: string[];
    icon?: FolderEmoji;
    color?: number;
}

export const SORT_OPTIONS = [
    { label: "Most recent first", value: "recent", default: true },
    { label: "Oldest first", value: "oldest" },
    { label: "Name A to Z", value: "name" },
    { label: "Order added", value: "manual" }
] as const;

export const settings = definePluginSettings({
    sortOrder: {
        type: OptionType.SELECT,
        description: "How conversations are sorted inside each folder.",
        options: SORT_OPTIONS
    },
    hideFromList: {
        type: OptionType.BOOLEAN,
        description: "Hide DMs and groups that are in a folder from the main DM list.",
        default: true
    }
}).withPrivateSettings<{ folders: Folder[]; collapsed: Record<string, boolean>; }>();

export const getFolders = () => settings.store.folders ?? [];

export const setCollapsed = (id: string, value: boolean) => {
    settings.store.collapsed = { ...settings.store.collapsed, [id]: value };
};

export const isInFolder = (channelId: string) => getFolders().some(f => f.channels.includes(channelId));

export function createFolder(data: Pick<Folder, "name" | "icon" | "color">, channelId?: string) {
    settings.store.folders = [...getFolders(), { ...data, id: crypto.randomUUID(), channels: channelId ? [channelId] : [] }];
}

export function updateFolder(id: string, changes: Partial<Omit<Folder, "id">>) {
    settings.store.folders = getFolders().map(f => f.id === id ? { ...f, ...changes } : f);
}

export function deleteFolder(id: string) {
    settings.store.folders = getFolders().filter(f => f.id !== id);
}

export function removeFromFolder(id: string, channelId: string) {
    settings.store.folders = getFolders().map(f => f.id === id ? { ...f, channels: f.channels.filter(c => c !== channelId) } : f);
}

export function toggleChannel(id: string, channelId: string) {
    const add = !getFolders().find(f => f.id === id)?.channels.includes(channelId);

    settings.store.folders = getFolders().map(f => {
        const channels = f.channels.filter(c => c !== channelId);
        return f.id === id && add ? { ...f, channels: [...channels, channelId] } : { ...f, channels };
    });
}
