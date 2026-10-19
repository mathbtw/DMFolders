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

import { cl, FolderControls, FoldersPage, openFolderModal } from "./FoldersPage";
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
            find: /path:\i\.\i\.ME,exact:!0,render:\i,impressionName:\i\.\i\.FRIENDS/,
            replacement: {
                match: /path:(\i\.\i\.ME),exact:!0/,
                replace: `path:[$1,"${ROUTE}"],exact:!0`
            }
        },
        {
            find: /\i===\i\.\i\.ADD_FRIEND\?\(0,\i\.jsx\)\(\i,\{\}\):\(0,\i\.jsx\)\(\i,\{titleId:\i\}\)/,
            replacement: [
                {
                    match: /toolbar:\(0,(\i)\.jsx\)\((\i),\{\}\),role:"navigation"/,
                    replace: 'toolbar:$self.isFolders()?null:(0,$1.jsx)($2,{}),role:"navigation"'
                },
                {
                    match: /(\i=)(\i===\i\.\i\.ADD_FRIEND\?\(0,\i\.jsx\)\(\i,\{\}\):\(0,\i\.jsx\)\(\i,\{titleId:\i\}\))/,
                    replace: "$1$self.isFolders()?$self.renderPage():$2"
                },
                {
                    match: /\(0,(\i)\.jsx\)\((\i\.A)\.Icon,\{icon:(\i\.\$),"aria-hidden":!0\}\),\(0,\i\.jsx\)\(\i\.A\.Title,\{id:(\i),children:([^}]+?)\}\)/,
                    replace: '(0,$1.jsx)($2.Icon,{icon:$self.isFolders()?$self.Icon:$3,"aria-hidden":!0}),(0,$1.jsx)($2.Title,{id:$4,children:$self.isFolders()?"Folders":$5}),$self.isFolders()?$self.renderControls():null'
                },
                {
                    match: /\.filter\((\i)=>\1\.show\)\.map\((\i)=>\(0,(\i)\.jsx\)\((\i)\.V\.Item/,
                    replace: ".filter($1=>$1.show&&!$self.isFolders()).map($2=>(0,$3.jsx)($4.V.Item"
                }
            ]
        },
        {
            find: /pathname\.startsWith\(\i\.\i\.COLLECTIBLES_SHOP\)\?\(\i=.{0,120}pathname\.startsWith\(\i\.\i\.FRIENDS\)/,
            replacement: {
                match: /(\i)\.pathname\.startsWith\(\i\.\i\.FRIENDS\)\?\((\i)=[^,]+,(\i)=/,
                replace: `$1.pathname.startsWith("${ROUTE}")?($2="Folders",$3=$self.renderTitleIcon()):$&`
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

    Icon,

    isFolders: () => window.location.pathname.startsWith(ROUTE),

    renderControls: () => <FolderControls />,

    renderTitleIcon: () => <FolderIcon className={cl("title-icon")} width={16} height={16} />,

    renderNavButton: (selected: boolean) => <NavButton key="vc-dmfolders" selected={selected} />,

    renderPage: ErrorBoundary.wrap(FoldersPage, { noop: true })
});
