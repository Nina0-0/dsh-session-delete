/**
 * Session delete — browser half.
 *
 * Adds one trash button to every Session row of the sidebar, immediately after
 * the shipped archive button (`sidebar.workspaces.session.row.action` order
 * 150), and the confirmation dialog that owns the erase. The dialog is a
 * `shell.overlay` entry, like the shipped archive confirmation, so it renders
 * above the whole frame instead of inside the row.
 *
 * A prebuilt client bundle: it registers a factory with the module loader and
 * resolves only baseline modules (`react`), exactly like the shipped client
 * packages.
 */
window.__ModuleLoader__.load({
	id: "dsh-session-delete",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;

		/** Dictionary namespace owned by this plugin. */
		const NS = "sessionDelete";

		/** Simplified Chinese copy. */
		const zh = {
			"actions.delete": "删除会话",
			"actions.delete.aria": "删除「{title}」",
			"dialog.title": "删除这个会话？",
			"dialog.body": "「{title}」的完整对话记录会从磁盘删除，无法恢复。",
			"dialog.untitled": "未命名会话",
			"dialog.active": "这是你正在查看的会话，删除后它会关闭。",
			"dialog.facts": "对话记录、投影缓存，以及它在工作区中的位置都会一并移除。",
			"dialog.cancel": "取消",
			"dialog.confirm": "删除",
			"dialog.deleting": "删除中…",
			"dialog.failed": "删除失败：{message}",
		};

		/** English copy. */
		const en = {
			"actions.delete": "Delete session",
			"actions.delete.aria": "Delete “{title}”",
			"dialog.title": "Delete this session?",
			"dialog.body": "The full transcript of “{title}” is erased from disk. This cannot be undone.",
			"dialog.untitled": "Untitled session",
			"dialog.active": "This is the session you have open; it closes when you delete it.",
			"dialog.facts": "The transcript, its projection cache, and its place in the workspace are all removed.",
			"dialog.cancel": "Cancel",
			"dialog.confirm": "Delete",
			"dialog.deleting": "Deleting…",
			"dialog.failed": "Delete failed: {message}",
		};

		/** Host route that performs the erase. */
		const ROUTE = "/plugin/session-delete";

		/* ------------------------------------------------------------------ *
		 * One pending request, shared by the row button and the dialog.
		 * ------------------------------------------------------------------ */

		let pendingRequest = null;
		const pendingListeners = new Set();

		/**
		 * Read the request awaiting confirmation.
		 * @returns the request, or null.
		 */
		function getPending() {
			return pendingRequest;
		}

		/**
		 * Subscribe to request changes.
		 * @param listener - callback invoked on every change.
		 * @returns the unsubscribe function.
		 */
		function subscribePending(listener) {
			pendingListeners.add(listener);
			return () => {
				pendingListeners.delete(listener);
			};
		}

		/**
		 * Publish the next pending request.
		 * @param next - the request to confirm, or null to close.
		 */
		function setPending(next) {
			if (Object.is(next, pendingRequest)) return;
			pendingRequest = next;
			for (const listener of [...pendingListeners]) listener();
		}

		/* ------------------------------------------------------------------ *
		 * Wire
		 * ------------------------------------------------------------------ */

		/**
		 * Resolve the Host route against the page's own origin.
		 * @returns the absolute request URL.
		 */
		function routeUrl() {
			const base = typeof document === "undefined" ? undefined : document.baseURI;
			return base === undefined ? ROUTE : new URL(ROUTE, base).href;
		}

		/**
		 * Ask the Host to erase one Session.
		 * @param sessionId - the Session to erase.
		 * @returns the Host's report.
		 */
		async function eraseSession(sessionId) {
			const response = await fetch(routeUrl(), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId }),
			});
			let payload;
			try {
				payload = await response.json();
			} catch {
				payload = undefined;
			}
			if (!response.ok || payload === null || typeof payload !== "object" || payload.ok !== true) {
				const detail =
					payload !== null && typeof payload === "object" && typeof payload.error === "string"
						? payload.error
						: `HTTP ${String(response.status)}`;
				throw new Error(detail);
			}
			return payload;
		}

		/* ------------------------------------------------------------------ *
		 * Row button
		 * ------------------------------------------------------------------ */

		/** Shared geometry of the shipped row icon buttons. */
		const iconButtonStyle = {
			borderRadius: "var(--dsw-radius-xs)",
			cursor: "pointer",
			width: 16,
			height: 16,
			color: "var(--dsw-alias-label-tertiary)",
			background: "none",
			border: "none",
			flex: "none",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			padding: 0,
		};

		/**
		 * Draw the trash glyph.
		 * @returns the icon element.
		 */
		function TrashIcon() {
			return h(
				"svg",
				{
					width: 14,
					height: 14,
					viewBox: "0 0 14 14",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.4,
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": true,
					focusable: "false",
					style: { display: "block" },
				},
				h("path", { d: "M2.2 3.9h9.6" }),
				h("path", { d: "M5.4 3.9V2.6h3.2v1.3" }),
				h("path", { d: "M3.5 3.9l.5 7.3h6l.5-7.3" }),
				h("path", { d: "M5.9 6.1v2.9" }),
				h("path", { d: "M8.1 6.1v2.9" }),
			);
		}

		/**
		 * One row's delete button.
		 * @param props - the row share, the `t` seat, and the injected request callback.
		 * @returns the button.
		 */
		function DeleteSessionRowButton({ sessionId, displayTitle, useSessions, t, requestDelete }) {
			const [hovered, setHovered] = React.useState(false);
			const [focused, setFocused] = React.useState(false);
			const title = typeof displayTitle === "string" && displayTitle !== "" ? displayTitle : t("dialog.untitled");
			const active = useSessions((directory) => (directory?.byId?.[sessionId]?.retainedBy?.mainView ?? 0) > 0);
			const style = {
				...iconButtonStyle,
				color: hovered || focused ? "var(--dsw-alias-state-error-primary)" : iconButtonStyle.color,
				boxShadow: focused ? "0 0 0 2px var(--dsw-alias-state-error-primary)" : "none",
				transition: "color .12s var(--ds-ease-in-out)",
			};
			return h(
				"button",
				{
					type: "button",
					style,
					className: "dshSessionDelete_rowButton",
					"aria-label": t("actions.delete.aria", { title }),
					title: t("actions.delete"),
					onMouseEnter: () => setHovered(true),
					onMouseLeave: () => setHovered(false),
					onFocus: () => setFocused(true),
					onBlur: () => setFocused(false),
					onClick: (event) => {
						event.preventDefault();
						event.stopPropagation();
						requestDelete({ sessionId, displayTitle: title, active });
					},
				},
				h(TrashIcon),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Confirmation dialog
		 * ------------------------------------------------------------------ */

		/** Dialog copy and box metrics, all token-driven. */
		const dialogStyles = {
			backdrop: {
				position: "fixed",
				inset: 0,
				zIndex: 60,
				display: "grid",
				placeItems: "center",
				padding: 20,
				// `shell.overlay` is click-through; an entry opts back in.
				pointerEvents: "auto",
				background: "color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent)",
				backdropFilter: "blur(2px)",
			},
			card: {
				boxSizing: "border-box",
				width: "100%",
				maxWidth: 400,
				display: "grid",
				gap: 12,
				padding: 20,
				borderRadius: 14,
				border: "0.5px solid var(--dsw-alias-border-l1)",
				background: "var(--dsw-alias-bg-overlay)",
				boxShadow: "0 18px 48px rgba(0, 0, 0, 0.3)",
				color: "var(--dsw-alias-label-primary)",
			},
			titleRow: {
				display: "flex",
				alignItems: "center",
				gap: 8,
			},
			title: {
				margin: 0,
				fontSize: 15,
				lineHeight: "22px",
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary)",
			},
			titleIcon: {
				color: "var(--dsw-alias-state-error-primary)",
				display: "inline-flex",
			},
			body: {
				margin: 0,
				fontSize: 13,
				lineHeight: "20px",
				color: "var(--dsw-alias-label-secondary)",
			},
			facts: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-label-secondary)",
			},
			active: {
				margin: 0,
				padding: "8px 10px",
				borderRadius: 8,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-state-warn-primary)",
				background: "color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent)",
			},
			error: {
				margin: 0,
				fontSize: 12,
				lineHeight: "18px",
				color: "var(--dsw-alias-state-error-primary)",
			},
			footer: {
				display: "flex",
				justifyContent: "flex-end",
				gap: 8,
				paddingTop: 4,
			},
		};

		/**
		 * Shared button chrome for the dialog footer.
		 * @param variant - outline or destructive.
		 * @returns the style object.
		 */
		function footerButtonStyle(variant) {
			const destructive = variant === "destructive";
			return {
				boxSizing: "border-box",
				height: 32,
				padding: "0 14px",
				borderRadius: 8,
				cursor: "pointer",
				font: "inherit",
				fontSize: 13,
				lineHeight: "20px",
				border: destructive ? "none" : "0.5px solid var(--dsw-alias-border-l2)",
				background: destructive ? "var(--dsw-alias-state-error-primary)" : "transparent",
				color: destructive ? "#fff" : "var(--dsw-alias-label-primary)",
				opacity: 1,
			};
		}

		/**
		 * The confirmation card for one request: busy, error, and dirty state die
		 * with it because the dialog keys it by Session.
		 * @param props - the request, the `t` seat, and the panel dismissal.
		 * @returns the card element.
		 */
		function DeleteConfirmCard({ request, t, dismissPanel }) {
			const [busy, setBusy] = React.useState(false);
			const [failure, setFailure] = React.useState(undefined);
			const close = () => {
				if (busy) return;
				setPending(null);
			};
			const confirm = () => {
				if (busy) return;
				setBusy(true);
				setFailure(undefined);
				// Close the panel first: a session being erased on disk must not stay
				// behind the dialog as the thing the main view is showing.
				if (request.active) dismissPanel();
				eraseSession(request.sessionId).then(
					() => {
						setPending(null);
					},
					(reason) => {
						setBusy(false);
						setFailure(reason instanceof Error ? reason.message : String(reason));
					},
				);
			};
			return h(
				"div",
				{
					style: dialogStyles.backdrop,
					role: "presentation",
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) close();
					},
				},
				h(
					"div",
					{
						style: dialogStyles.card,
						role: "dialog",
						"aria-modal": true,
						"aria-labelledby": "dsh-session-delete-title",
						"aria-describedby": "dsh-session-delete-body",
					},
					h(
						"div",
						{ style: dialogStyles.titleRow },
						h("span", { style: dialogStyles.titleIcon }, h(TrashIcon)),
						h("h2", { id: "dsh-session-delete-title", style: dialogStyles.title }, t("dialog.title")),
					),
					h("p", { id: "dsh-session-delete-body", style: dialogStyles.body }, t("dialog.body", { title: request.displayTitle })),
					request.active ? h("p", { style: dialogStyles.active }, t("dialog.active")) : null,
					h("p", { style: dialogStyles.facts }, t("dialog.facts")),
					failure === undefined ? null : h("p", { style: dialogStyles.error, role: "alert" }, t("dialog.failed", { message: failure })),
					h(
						"div",
						{ style: dialogStyles.footer },
						h(
							"button",
							{
								type: "button",
								style: footerButtonStyle("outline"),
								disabled: busy,
								autoFocus: true,
								onClick: close,
							},
							t("dialog.cancel"),
						),
						h(
							"button",
							{
								type: "button",
								style: footerButtonStyle("destructive"),
								disabled: busy,
								onClick: confirm,
							},
							busy ? t("dialog.deleting") : t("dialog.confirm"),
						),
					),
				),
			);
		}

		/**
		 * The `shell.overlay` entry: nothing while no confirmation is pending,
		 * otherwise one card per request.
		 * @param props - the `t` seat and the panel dismissal.
		 * @returns the overlay content.
		 */
		function SessionDeleteDialog({ t, dismissPanel }) {
			const request = React.useSyncExternalStore(subscribePending, getPending, getPending);
			React.useEffect(() => {
				if (request === null) return undefined;
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.stopPropagation();
					event.preventDefault();
					setPending(null);
				};
				window.addEventListener("keydown", onKeyDown, true);
				return () => {
					window.removeEventListener("keydown", onKeyDown, true);
				};
			}, [request]);
			if (request === null) return null;
			return h(DeleteConfirmCard, { key: request.sessionId, request, t, dismissPanel });
		}

		/* ------------------------------------------------------------------ *
		 * Plugin body
		 * ------------------------------------------------------------------ */

		/** Required Client services. */
		const inject = ["slots", "locale", "layout"];

		/**
		 * Mount the row button and its dialog.
		 * @param ctx - the browser plugin context.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-delete:dictionaries");

			const rowInjected = () => ({
				requestDelete: (request) => {
					setPending(request);
				},
			});
			const dialogInjected = () => ({
				dismissPanel: () => {
					try {
						ctx.layout.selectPanel(null);
					} catch (error) {
						console.warn("[session-delete] could not clear the main panel", error);
					}
				},
			});

			ctx.effect(
				() =>
					ctx.slots.inject("sidebar.workspaces.session.row.action", () =>
						ctx.slots.register(
							{
								name: "sidebar.workspaces.session.row.action",
								id: "delete",
								order: 150,
								locale: NS,
								inject: rowInjected,
							},
							DeleteSessionRowButton,
						),
					),
				"session-delete:row-button",
			);

			ctx.effect(
				() =>
					ctx.slots.inject("shell.overlay", () =>
						ctx.slots.register(
							{
								name: "shell.overlay",
								id: "session-delete",
								locale: NS,
								inject: dialogInjected,
							},
							SessionDeleteDialog,
						),
					),
				"session-delete:dialog",
			);
		}

		return { inject, apply };
	},
});
