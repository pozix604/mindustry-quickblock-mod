var Keys = Packages.arc.input.KeyCode;
var COLOR_SELECTED = Packages.mindustry.graphics.Pal.accent;
var COLOR_NORMAL = Packages.arc.graphics.Color.white;

var TITLE = "Block Search";
var OPEN_KEY = Keys.slash;
var MIN_CHARS = 3; // characters needed before matching starts
var MAX_ROWS = 20; // visible rows in the results list
var FIELD_WIDTH = 320;
var LIST_WIDTH = 360;
var ICON_SIZE = 24;
var COST_WIDTH = 96; // minimum width of each resource column
var EMPTY_MARK = "\u00b7"; // shown where a block doesn't need a resource (\u00b7 = centered middle dot)
var COLUMN_GAP = 32; // space between result columns (the gap after the icon is half of this)
var HINT = "Type " + MIN_CHARS + " characters to match";

var dialog, field, label, listTable;
var query = "",
    lastText = null; // search box state
var matches = [],
    sel = 0,
    winStart = 0; // result box state
var costItems = []; // resource columns: every item any current match needs
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
    dialog.cont.add(field).center().width(FIELD_WIDTH).height(40);
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
            costItems = [];
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
        costItems = [];
        if (query.length >= MIN_CHARS) {
            var blocks = Vars.content.blocks();
            for (var bi = 0; bi < blocks.size; bi++) {
                var b = blocks.get(bi);
                var name = String(b.localizedName);
                if (name.toLowerCase().split(" ").join("").indexOf(query) < 0) continue;

                // Filter on available blocks
                if (b.isVisible() && b.unlockedNow() && b.placeablePlayer && b.isPlaceable() && b.environmentBuildable()) {
                    matches.push({
                        block: b,
                        name: name
                    });
                }
            }
            matches.sort((x, y) => x.name.localeCompare(y.name)); // alphabetical

            // Resource columns: every item needed by any match, in the game's item order
            var needed = {};
            for (var mi = 0; mi < matches.length; mi++) {
                var reqs = matches[mi].block.requirements;
                for (var qi = 0; qi < reqs.length; qi++) needed[String(reqs[qi].item.name)] = true;
            }
            var items = Vars.content.items();
            for (var ii = 0; ii < items.size; ii++) {
                if (needed[String(items.get(ii).name)]) costItems.push(items.get(ii));
            }
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
            var blk = matches[r].block;

            // columns: marker | icon | name | logic name | one column per resource
            var mark = new Label(r === sel ? ">" : " ");
            mark.setColor(color);
            listTable.add(mark).width(16);

            try {
                listTable.image(blk.uiIcon).size(ICON_SIZE).padRight(COLUMN_GAP / 2);
            } catch (e) {
                listTable.add(new Label("")); // keep the columns aligned if the icon is unavailable
            }

            var nameLabel = new Label(matches[r].name);
            nameLabel.setColor(color);
            listTable.add(nameLabel).left().padRight(COLUMN_GAP);

            var logicLabel = new Label("@" + blk.name); // the name used in logic processors
            logicLabel.setColor(color);
            listTable.add(logicLabel).left().padRight(COLUMN_GAP);

            var amounts = {}; // this block's build cost, by item name
            for (var ri = 0; ri < blk.requirements.length; ri++) {
                amounts[String(blk.requirements[ri].item.name)] = blk.requirements[ri].amount;
            }
            for (var ci = 0; ci < costItems.length; ci++) {
                var cell = new Table(); // one fixed column per resource: amount [icon], or EMPTY_MARK [blank]
                cell.right();
                var amount = amounts[String(costItems[ci].name)];
                var amountLabel = new Label(amount !== undefined ? String(amount) : EMPTY_MARK);
                amountLabel.setColor(color);
                cell.add(amountLabel).padRight(2);
                if (amount !== undefined) {
                    try {
                        cell.image(costItems[ci].uiIcon).size(ICON_SIZE);
                    } catch (e) {} // icon is cosmetic
                } else {
                    cell.add(new Label("")).size(ICON_SIZE); // empty icon, so blank cells match filled ones
                }
                listTable.add(cell).right().minWidth(COST_WIDTH).padBottom(2);
            }
            listTable.row();
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
