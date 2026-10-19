/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import { FolderIcon } from "@components/Icons";
import { classNameFactory, classNameToSelector } from "@utils/css";
import { Channel, RenderModalProps } from "@vencord/discord-types";
import { extractAndLoadChunksLazy, findByPropsLazy, findComponentByCodeLazy, findCssClassesLazy } from "@webpack";
import { Avatar, Button, ChannelStore, Clickable, ColorPicker, Constants, IconUtils, Modal, moment, openModalLazy, Popout, PrivateChannelSortStore, ReadStateStore, RestAPI, Select, SelectedChannelStore, Text, TextInput, useEffect, useRef, UserStore, useState, useStateFromStores } from "@webpack/common";

import { createFolder, deleteFolder, Folder, FolderEmoji, getFolders, removeFromFolder, setCollapsed, settings, SORT_OPTIONS, updateFolder } from "./store";

export const cl = classNameFactory("vc-dmfolders-");

const DEFAULT_COLOR = 5793266;
const SWATCHES = [1752220, 3066993, 3447003, 10181046, 15277667, 15844367, 15105570, 15158332, 9807270, 5793266];

interface EmojiPickerProps {
    channel: Channel | null;
    closePopout(): void;
    onSelectEmoji(selection: { emoji: { id?: string | null; name?: string | null; optionallyDiverseSequence?: string; animated?: boolean; } | null; willClose: boolean; }): void;
}

interface ColorPickerWithSwatchesProps {
    defaultColor: number;
    colors: number[];
    value: number;
    onChange(value: number | null): void;
    renderDefaultButton(): React.ReactNode;
    renderCustomButton(): React.ReactNode;
}

const ColorPickerWithSwatches = findComponentByCodeLazy<ColorPickerWithSwatchesProps>('id:"color-picker"');
const colorClasses = findCssClassesLazy("defaultContainer");
const EmojiPicker = findComponentByCodeLazy<EmojiPickerProps>("showAddEmojiButton:", "pickerIntention:", "messageId:");
const requireSettingsModal = extractAndLoadChunksLazy(['type:"USER_SETTINGS_MODAL_OPEN"']);
const GroupDmsRecipientsIcon = findComponentByCodeLazy('["aria-hidden"],"aria-label":');
const SelectedChannelActionCreators = findByPropsLazy("selectPrivateChannel");

const toHex = (color?: number) => color == null ? undefined : `#${color.toString(16).padStart(6, "0")}`;

function Emoji({ emoji }: { emoji: FolderEmoji; }) {
    return emoji.id
        ? <img className={cl("emoji")} src={IconUtils.getEmojiURL({ id: emoji.id, animated: !!emoji.animated, size: 48 })} alt={emoji.name} />
        : <span className={cl("emoji")}>{emoji.name}</span>;
}

function EmojiPickerButton({ icon, onSelect }: { icon?: FolderEmoji; onSelect(emoji: FolderEmoji): void; }) {
    const ref = useRef<HTMLDivElement>(null);
    const channel = useStateFromStores([SelectedChannelStore, ChannelStore], () => ChannelStore.getChannel(SelectedChannelStore.getChannelId()) ?? null);

    return (
        <Popout
            position="bottom"
            align="left"
            targetElementRef={ref}
            renderPopout={({ closePopout }) => (
                <EmojiPicker
                    channel={channel}
                    closePopout={closePopout}
                    onSelectEmoji={({ emoji, willClose }) => {
                        const name = emoji?.optionallyDiverseSequence?.trim() || emoji?.name;
                        if (name) onSelect({ name, id: emoji?.id ?? undefined, animated: emoji?.animated });
                        if (willClose) closePopout();
                    }}
                />
            )}
        >
            {popoutProps => (
                <div {...popoutProps} ref={ref} className={cl("emoji-trigger")}>
                    {icon ? <Emoji emoji={icon} /> : <FolderIcon width={24} height={24} />}
                </div>
            )}
        </Popout>
    );
}

interface FolderModalProps {
    modalProps: RenderModalProps;
    folder?: Folder;
    channelId?: string;
}

function FolderModal({ modalProps, folder, channelId }: FolderModalProps) {
    const [name, setName] = useState(folder?.name ?? "");
    const [icon, setIcon] = useState(folder?.icon);
    const [color, setColor] = useState(folder?.color ?? DEFAULT_COLOR);

    const save = () => {
        const data = { name: name.trim(), icon, color };
        modalProps.onClose();
        if (folder) updateFolder(folder.id, data);
        else createFolder(data, channelId);
    };

    return (
        <Modal
            {...modalProps}
            title={folder ? "Edit folder" : "New folder"}
            actions={[{ text: folder ? "Save" : "Create", variant: "primary", onClick: save, disabled: !name.trim() }]}
        >
            <form
                className={cl("modal")}
                onSubmit={e => {
                    e.preventDefault();
                    if (name.trim()) save();
                }}
            >
                <section>
                    <Heading tag="h5">Name</Heading>
                    <TextInput value={name} onChange={setName} autoFocus />
                </section>
                <section>
                    <Heading tag="h5">Icon</Heading>
                    <div className={cl("icon-row")}>
                        <EmojiPickerButton icon={icon} onSelect={setIcon} />
                        {icon && (
                            <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => setIcon(undefined)}>
                                Clear
                            </Button>
                        )}
                    </div>
                </section>
                <section>
                    <Heading tag="h5">Color</Heading>
                    <style>{`${classNameToSelector(colorClasses.defaultContainer)}{display:none}`}</style>
                    <div className={cl("color")}>
                        <ColorPickerWithSwatches
                            defaultColor={DEFAULT_COLOR}
                            colors={SWATCHES}
                            value={color}
                            onChange={c => setColor(c ?? DEFAULT_COLOR)}
                            renderDefaultButton={() => null}
                            renderCustomButton={() => <ColorPicker color={color} onChange={c => setColor(c ?? DEFAULT_COLOR)} showEyeDropper={false} />}
                        />
                    </div>
                </section>
            </form>
        </Modal>
    );
}

export const openFolderModal = (folder?: Folder, channelId?: string) =>
    openModalLazy(async () => {
        await requireSettingsModal();
        return modalProps => <FolderModal modalProps={modalProps} folder={folder} channelId={channelId} />;
    });

function getName(channel: Channel) {
    if (channel.isMultiUserDM()) {
        return channel.name || channel.recipients.map(r => UserStore.getUser(r)?.username).filter(Boolean).join(", ");
    }

    const user = UserStore.getUser(channel.recipients[0]);
    return user?.globalName ?? user?.username ?? "Unknown user";
}

interface LastMessage {
    id: string;
    content: string;
    timestamp: string;
    author: { username: string; global_name?: string | null; };
    attachments: unknown[];
}

function formatPreview(message: LastMessage) {
    const author = message.author.global_name ?? message.author.username;
    const text = message.content.replace(/\s+/g, " ").trim() || (message.attachments.length ? "Sent an attachment" : "Sent a message");
    return `${author}: ${text}`;
}

function sortChannels(ids: string[], order: string | undefined, recent: string[]) {
    if (order === "manual") return ids;

    const nameOf = (id: string) => {
        const channel = ChannelStore.getChannel(id);
        return channel ? getName(channel) : "";
    };
    const rank = (id: string) => recent.indexOf(id) === -1 ? Infinity : recent.indexOf(id);

    if (order === "name") return [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

    const byRecent = [...ids].sort((a, b) => rank(a) - rank(b));
    return order === "oldest" ? byRecent.reverse() : byRecent;
}

function ChannelRow({ id, folderId, visible }: { id: string; folderId: string; visible: boolean; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(id), [id]);
    const mentions = useStateFromStores([ReadStateStore], () => ReadStateStore.getMentionCount(id), [id]);
    const unread = useStateFromStores([ReadStateStore], () => ReadStateStore.hasUnread(id), [id]);

    const lastMessageId = channel?.lastMessageId;
    const [last, setLast] = useState<LastMessage | null>(null);

    useEffect(() => {
        if (!visible || !lastMessageId || last?.id === lastMessageId) return;

        let stale = false;
        RestAPI.get({ url: Constants.Endpoints.MESSAGES(id), query: { limit: 1 } })
            .then(res => !stale && setLast(res.body[0] ?? null))
            .catch(() => !stale && setLast(null));

        return () => {
            stale = true;
        };
    }, [id, lastMessageId, visible]);

    if (!channel) return null;

    const name = getName(channel);

    return (
        <div className={cl("row")} onClick={() => SelectedChannelActionCreators.selectPrivateChannel(id)}>
            <div className={cl("row-date")}>
                {last && (
                    <>
                        <Text variant="text-xs/semibold">{moment(last.timestamp).format("DD/MM/YY")}</Text>
                        <Text variant="text-xs/normal">{moment(last.timestamp).format("HH:mm")}</Text>
                    </>
                )}
            </div>
            {channel.isMultiUserDM()
                ? channel.icon
                    ? <Avatar src={`https://cdn.discordapp.com/channel-icons/${id}/${channel.icon}.png`} size="SIZE_32" aria-label={name} />
                    : <GroupDmsRecipientsIcon recipients={channel.recipients} channel={channel} size="SIZE_32" isTyping={null} />
                : <Avatar src={UserStore.getUser(channel.recipients[0])?.getAvatarURL(undefined, 128, true)} size="SIZE_32" aria-label={name} />}
            <div className={cl("row-text")}>
                <Text variant="text-md/medium" className={cl("row-name")}>{name}</Text>
                {last && <Text variant="text-sm/normal" className={cl("row-preview")}>{formatPreview(last)}</Text>}
            </div>
            {mentions > 0 && <span className={cl("badge")}>{mentions}</span>}
            {!mentions && unread && <span className={cl("badge", "unread")}>●</span>}
            <Button
                className={cl("row-remove")}
                size={Button.Sizes.SMALL}
                color={Button.Colors.PRIMARY}
                onClick={e => {
                    e.stopPropagation();
                    removeFromFolder(folderId, id);
                }}
            >
                Remove
            </Button>
        </div>
    );
}

function FolderSection({ folder }: { folder: Folder; }) {
    const color = toHex(folder.color);
    const recent = useStateFromStores([PrivateChannelSortStore], () => PrivateChannelSortStore.getPrivateChannelIds());
    const channels = sortChannels(folder.channels, settings.store.sortOrder, recent);
    const [collapsed, setCollapsedState] = useState(!!settings.store.collapsed?.[folder.id]);
    const mentions = useStateFromStores([ReadStateStore], () =>
        folder.channels.reduce((n, id) => n + ReadStateStore.getMentionCount(id), 0)
    , [folder.channels]);

    return (
        <section className={cl("folder")}>
            <Clickable
                className={cl("folder-header")}
                style={{ borderBottomColor: color }}
                onClick={() => {
                    setCollapsedState(!collapsed);
                    setCollapsed(folder.id, !collapsed);
                }}
            >
                <svg className={cl("chevron", { collapsed })} aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M9.3 5.3a1 1 0 0 0 0 1.4l5.29 5.3-5.3 5.3a1 1 0 1 0 1.42 1.4l6-6a1 1 0 0 0 0-1.4l-6-6a1 1 0 0 0-1.42 0Z" />
                </svg>
                {folder.icon
                    ? <Emoji emoji={folder.icon} />
                    : <FolderIcon width={20} height={20} style={{ color }} />}
                <Text variant="heading-lg/semibold" className={cl("folder-name")} style={{ color }}>
                    {folder.name} ({folder.channels.length})
                </Text>
                {collapsed && mentions > 0 && <span className={cl("badge")}>{mentions}</span>}
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.PRIMARY}
                    onClick={e => {
                        e.stopPropagation();
                        openFolderModal(folder);
                    }}
                >
                    Edit
                </Button>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.RED}
                    onClick={e => {
                        e.stopPropagation();
                        deleteFolder(folder.id);
                    }}
                >
                    Delete
                </Button>
            </Clickable>
            <div className={cl("content", { collapsed })}>
                <div className={cl("content-inner")}>
                    {folder.channels.length === 0 && (
                        <Text variant="text-md/normal">Right click a DM or a group, then pick Folders to put it here.</Text>
                    )}
                    {channels.map(id => <ChannelRow key={id} id={id} folderId={folder.id} visible={!collapsed} />)}
                </div>
            </div>
        </section>
    );
}

const PAGE_SETTINGS: Array<"folders"> = ["folders"];
const CONTROLS_SETTINGS: Array<"sortOrder"> = ["sortOrder"];
const PAGE_PADDING = 32;

let pageElement: HTMLElement | null = null;

export function FolderControls() {
    settings.use(CONTROLS_SETTINGS);
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; right: number; } | null>(null);

    useEffect(() => {
        const bar = ref.current?.parentElement;
        if (!bar) return;

        const update = () => {
            if (!pageElement) return;

            const barRect = bar.getBoundingClientRect();
            const contentRight = pageElement.getBoundingClientRect().left + pageElement.clientWidth;
            setPosition({
                top: barRect.top + barRect.height / 2,
                right: window.innerWidth - contentRight + PAGE_PADDING
            });
        };

        const observer = new ResizeObserver(update);
        observer.observe(bar);
        if (pageElement) observer.observe(pageElement);
        update();

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={cl("controls")}
            style={position ? { top: position.top, right: position.right } : { visibility: "hidden" }}
        >
            <div className={cl("sort")}>
                <Select
                    options={SORT_OPTIONS.map(({ label, value }) => ({ label, value }))}
                    select={v => {
                        settings.store.sortOrder = v;
                    }}
                    isSelected={v => v === settings.store.sortOrder}
                    serialize={String}
                />
            </div>
            <Button size={Button.Sizes.SMALL} color={Button.Colors.BRAND} onClick={() => openFolderModal()}>
                New folder
            </Button>
        </div>
    );
}

export function FoldersPage() {
    settings.use(PAGE_SETTINGS);

    return (
        <div
            className={cl("page")}
            ref={element => {
                pageElement = element;
            }}
        >
            {getFolders().map(folder => <FolderSection key={folder.id} folder={folder} />)}
        </div>
    );
}
