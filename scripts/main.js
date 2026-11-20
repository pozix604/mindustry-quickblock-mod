var Keys = Packages.arc.input.KeyCode;
var COLOR_SELECTED = Packages.mindustry.graphics.Pal.accent;
var COLOR_NORMAL = Packages.arc.graphics.Color.white;

var TITLE = "Block Search";
var OPEN_KEY = Keys.slash;
var MIN_CHARS = 3; // characters needed before matching starts
var MAX_ROWS = 15; // visible rows in the results list
var FIELD_WIDTH = 320;
var LIST_WIDTH = 360;
var ICON_SIZE = 24;
var HINT = "Type " + MIN_CHARS + " characters to match";

var dialog, field, label, listTable;
var query = "",
    lastText = null; // search box state
var matches = [],
    sel = 0,
    winStart = 0; // result box state
var dirty = false; // results need redrawing
var closing = false; // dialog closing ...

Events.on(ClientLoadEvent, () => {
    dialog = new Packages.mindustry.ui.dialogs.BaseDialog(TITLE);
    dialog.addCloseListener();

    label = new Label(HINT);
    field = new TextField("", Styles.defaultField);
    listTable = new Table();
    listTable.left();

    dialog.cont.add(label).left().padBottom(6).row();
    dialog.cont.add(listTable).left().minWidth(LIST_WIDTH).padBottom(8).row();
    dialog.cont.add(field).left().width(FIELD_WIDTH).height(40);
});

Events.run(Trigger.update, () => {
    if (dialog == null) return;
    var shown = dialog.isShown();

    if (!Vars.state.isGame()) {
        if (shown) dialog.hide();
        return;
    }

    // Reset state on open
    if (!shown) {
        if (Core.input.keyTap(OPEN_KEY) && Core.scene.getKeyboardFocus() == null &&
            !Core.scene.hasDialog() && !Vars.ui.chatfrag.shown()) {
            closing = false;
            lastText = null;
            query = "";
            matches = [];
            sel = winStart = 0;
            dirty = true;
            field.setText("");
            dialog.show();
            Core.scene.setKeyboardFocus(field);
        }
        return;
    }
    if (closing) return;

    // Run search on search text change.
    var text = String(field.getText());
    if (text !== lastText) {
        lastText = text;
        sel = winStart = 0;
        dirty = true;
        query = text.toLowerCase().split(" ").join(""); // spaces are ignored (in names too, below)
        matches = [];
        if (query.length >= MIN_CHARS) {
            var blocks = Vars.content.blocks();
            for (var bi = 0; bi < blocks.size; bi++) {
                var b = blocks.get(bi);
                var name = String(b.localizedName);
                if (name.toLowerCase().split(" ").join("").indexOf(query) < 0) continue;

                var ok = true; // Filter on available blocks
                try {
                    ok = ok && b.isVisible();
                } catch (e) {}
                try {
                    ok = ok && b.unlockedNow();
                } catch (e) {}
                try {
                    ok = ok && b.placeablePlayer;
                } catch (e) {}
                try {
                    ok = ok && b.isPlaceable();
                } catch (e) {}
                try {
                    ok = ok && b.environmentBuildable();
                } catch (e) {}
                if (ok) matches.push({
                    block: b,
                    name: name
                });
            }
            matches.sort((x, y) => x.name.localeCompare(y.name)); // alphabetical
        }
    }

    // Allow player to select block from list
    var step = Core.input.keyTap(Keys.down) ? 1 : (Core.input.keyTap(Keys.up) ? -1 : 0);
    if (step !== 0 && matches.length > 1) {
        sel = (sel + step + matches.length) % matches.length; // wraps at both ends
        if (sel < winStart) winStart = sel;
        if (sel >= winStart + MAX_ROWS) winStart = sel - MAX_ROWS + 1;
        dirty = true;
    }

    // Redraw dialog content
    if (dirty) {
        dirty = false;
        listTable.clear();
        for (var r = winStart; r < Math.min(matches.length, winStart + MAX_ROWS); r++) {
            var color = (r === sel) ? COLOR_SELECTED : COLOR_NORMAL;
            var row = new Table();
            row.left();

            var mark = new Label(r === sel ? ">" : " ");
            mark.setColor(color);
            row.add(mark).width(16);

            try {
                row.image(matches[r].block.uiIcon).size(ICON_SIZE).padRight(8);
            } catch (e) {} // icon is cosmetic

            var nameLabel = new Label(matches[r].name);
            nameLabel.setColor(color);
            row.add(nameLabel).left();

            listTable.add(row).left().padBottom(2).row();
        }
        label.setText(query.length < MIN_CHARS ? HINT : (matches.length === 0 ? "No matches" : ""));
    }

    // Select block on ENTER key
    if (Core.input.keyTap(Keys.enter)) {
        closing = true;
        if (matches.length > 0) Vars.control.input.block = matches[sel].block;
        Core.app.post(() => dialog.hide()); // hide on next frame so ENTER isn't also processed as "open chat"
    }
});
