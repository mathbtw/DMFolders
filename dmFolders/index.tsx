/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { FolderIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { Menu, ReadStateStore, useStateFromStores } from "@webpack/common";

import { cl, FoldersPage, openFolderModal } from "./FoldersPage";
import { getFolders, isInFolder, settings, toggleChannel } from "./store";

const ROUTE = "/channels/@me/folders";
const NAV_SETTINGS: Array<"folders"> = ["folders"];
const LIST_SETTINGS: Array<"folders" | "hideFromList"> = ["folders", "hideFromList"];

interface NavLinkProps {
    route: string;
    selected: boolean;
    icon: React.ComponentType<{ className?: string; }>;
    text: string;
    children?: React.ReactNode;
}

const NavLink = findComponentByCodeLazy<NavLinkProps>("nitroHoverGradient");

const Icon = ({ className }: { className?: string; }) => <FolderIcon className={className} width={20} height={20} />;

const NavButton = ErrorBoundary.wrap(({ selected }: { selected: boolean; }) => {
    settings.use(NAV_SETTINGS);
    const mentions = useStateFromStores([ReadStateStore], () =>
        getFolders().flatMap(f => f.channels).reduce((n, id) => n + ReadStateStore.getMentionCount(id), 0)
    );

    return (
        <NavLink route={ROUTE} selected={selected} icon={Icon} text="Folders">
            {mentions > 0 && <span className={cl("badge")}>{mentions}</span>}
        </NavLink>
    );
}, { noop: true });

function createFolderMenuItem(channelId: string) {
    const folders = getFolders();

    return (
        <Menu.MenuItem id="vc-dmfolders" label="Folders">
            {folders.map(f => (
                <Menu.MenuCheckboxItem
                    key={f.id}
                    id={`vc-dmfolders-${f.id}`}
                    label={f.name}
                    checked={f.channels.includes(channelId)}
                    action={() => toggleChannel(f.id, channelId)}
                />
            ))}
            {folders.length > 0 && <Menu.MenuSeparator />}
            <Menu.MenuItem
                id="vc-dmfolders-new"
                label="New folder"
                color="brand"
                action={() => openFolderModal(undefined, channelId)}
            />
        </Menu.MenuItem>
    );
}

const GroupDMContext: NavContextMenuPatchCallback = (children, props) => {
    findGroupChildrenByChildId("leave-channel", children)?.unshift(createFolderMenuItem(props.channel.id));
};

const UserContext: NavContextMenuPatchCallback = (children, props) => {
    const container = findGroupChildrenByChildId("close-dm", children);
    container?.splice(container.findIndex(c => c?.props?.id === "close-dm"), 0, createFolderMenuItem(props.channel.id));
};

export default definePlugin({
    name: "DMFolders",
    description: "Adds a Folders button under Quests that lists your DMs and groups sorted into folders.",
    authors: [{ name: "itsmathbtw", id: 334735518744969218n }],
    settings,
    contextMenus: {
        "gdm-context": GroupDMContext,
        "user-context": UserContext
    },

    patches: [
        {
            find: 'tutorialId:"direct-messages"',
            replacement: [
                {
                    match: /(\i)\.startsWith\(\i\.\i\.QUEST_HOME\)\},"quests"\),/,
                    replace: `$&$self.renderNavButton($1.startsWith("${ROUTE}")),`
                },
                {
                    match: /let \i=\[(?=\i\.\i\.FAMILY_CENTER,\i\.\i\.QUEST_HOME)/,
                    replace: `$&"${ROUTE}",`
                },
                {
                    match: /let\{showLibrary:\i,/,
                    replace: "$self.useFolders();$&"
                }
            ]
        },
        {
            find: ".ACTIVITY,disableTrack:!0,children:",
            replacement: {
                match: /\(0,(\i)\.jsx\)\((\i\.\i),\{path:\i\.\i\.ACTIVITY,disableTrack:!0,children:/,
                replace: `(0,$1.jsx)($2,{path:"${ROUTE}",render:()=>$self.renderPage(),disableTrack:!0}),$&`
            }
        },
        {
            find: '"dm-quick-launcher"===',
            replacement: {
                match: /(?<=channels:\i,)privateChannelIds:(\i)(?=,listRef:)/,
                replace: "privateChannelIds:$1.filter(c=>!$self.isHidden(c))"
            }
        }
    ],

    useFolders() {
        settings.use(LIST_SETTINGS);
    },

    isHidden: (channelId: string) => settings.store.hideFromList && isInFolder(channelId),

    renderNavButton: (selected: boolean) => <NavButton key="vc-dmfolders" selected={selected} />,

    renderPage: ErrorBoundary.wrap(FoldersPage, { noop: true })
});
