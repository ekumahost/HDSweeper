// Wallet Lists page
var WalletsPage = {
    _currentListId: null,
    _currentListName: null,
    _csvData: null,
    _csvColumns: null,

    render: async function() {
        var data = await API.get("/api/wallets/lists");
        var lists = data.lists || [];

        var rows = "";
        lists.forEach(function(l) {
            rows += "<tr>" +
                "<td>" + l.name + "</td>" +
                "<td>" + formatNumber(l.totalAddresses) + "</td>" +
                '<td style="color:var(--green)">' + formatNumber(l.matchedAddresses || 0) + "</td>" +
                "<td>" + formatNumber(l.sweptAddresses || 0) + "</td>" +
                "<td>" + new Date(l.createdAt).toLocaleDateString() + "</td>" +
                "<td>" +
                '<button class="btn btn-sm" onclick="WalletsPage.viewList(\'' + l._id + '\', \'' + l.name.replace(/'/g, "\\'") + '\')">' + 'View</button> ' +
                '<button class="btn btn-sm btn-danger" onclick="WalletsPage.remove(\'' + l._id + '\')">' + 'Del</button>' +
                "</td></tr>";
        });

        return '<div class="card"><h2>Import Wallet Addresses</h2>' +
            '<div style="display:flex;gap:8px;margin-bottom:16px">' +
            '<button class="btn btn-sm" id="modeTextBtn" onclick="WalletsPage.setImportMode(\'text\')" style="opacity:1">Paste Text</button>' +
            '<button class="btn btn-sm" id="modeCsvBtn" onclick="WalletsPage.setImportMode(\'csv\')" style="opacity:0.5">Import CSV</button>' +
            '</div>' +
            '<div class="form-group"><label>List Name</label><input id="walletListName" placeholder="e.g. Hot Wallets Batch 1" /></div>' +
            '<div class="form-group"><label>Description (optional)</label><input id="walletListDesc" placeholder="Exported from..." /></div>' +
            '<div id="importTextMode">' +
            '<div class="form-group"><label>Addresses (one per line, or comma-separated)</label>' +
            '<textarea id="walletAddresses" rows="6" placeholder="0xabc123...\n0xdef456...\n..."></textarea></div>' +
            '<button class="btn btn-primary" onclick="WalletsPage.importList()">Import</button>' +
            '</div>' +
            '<div id="importCsvMode" style="display:none">' +
            '<div class="form-group"><label>Select CSV File</label>' +
            '<input type="file" id="csvFile" accept=".csv,.txt" onchange="WalletsPage.parseCsv()" ' +
            'style="padding:8px;border:1px dashed var(--border);border-radius:6px;width:100%;cursor:pointer" /></div>' +
            '<div id="csvPreview"></div>' +
            '</div>' +
            "</div>" +
            '<div class="card"><h2>Wallet Lists (' + lists.length + ")</h2>" +
            '<div class="table-wrap"><table>' +
            "<thead><tr><th>Name</th><th>Total</th><th>Matched</th><th>Swept</th><th>Created</th><th>Actions</th></tr></thead>" +
            "<tbody>" + (rows || '<tr><td colspan="6">' + emptyState("No wallet lists imported yet") + "</td></tr>") + "</tbody>" +
            "</table></div></div>" +
            '<div id="walletListDetail"></div>';
    },

    setImportMode: function(mode) {
        var textDiv = document.getElementById("importTextMode");
        var csvDiv = document.getElementById("importCsvMode");
        var textBtn = document.getElementById("modeTextBtn");
        var csvBtn = document.getElementById("modeCsvBtn");
        if (mode === "csv") {
            textDiv.style.display = "none";
            csvDiv.style.display = "block";
            textBtn.style.opacity = "0.5";
            csvBtn.style.opacity = "1";
        } else {
            textDiv.style.display = "block";
            csvDiv.style.display = "none";
            textBtn.style.opacity = "1";
            csvBtn.style.opacity = "0.5";
        }
    },

    parseCsv: function() {
        var fileInput = document.getElementById("csvFile");
        var preview = document.getElementById("csvPreview");
        if (!fileInput.files || !fileInput.files[0]) return;

        var file = fileInput.files[0];
        var reader = new FileReader();
        reader.onload = function(e) {
            var text = e.target.result;
            var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
            if (lines.length < 2) {
                preview.innerHTML = '<p style="color:var(--red)">CSV must have a header row and at least one data row</p>';
                return;
            }

            // Parse header — handle quoted fields
            var headers = WalletsPage._parseCsvLine(lines[0]);
            WalletsPage._csvColumns = headers;

            // Parse all data rows
            var dataRows = [];
            for (var i = 1; i < lines.length; i++) {
                var row = WalletsPage._parseCsvLine(lines[i]);
                if (row.length > 0) dataRows.push(row);
            }
            WalletsPage._csvData = dataRows;

            // Auto-detect column with wallet addresses
            var autoCol = -1;
            for (var c = 0; c < headers.length; c++) {
                var h = headers[c].toLowerCase();
                if (h === "address" || h === "wallet" || h === "wallet_address" || h === "walletaddress") {
                    autoCol = c;
                    break;
                }
            }
            // Fallback: find first column with 0x values
            if (autoCol === -1) {
                for (var c = 0; c < headers.length; c++) {
                    var sample = dataRows.length > 0 ? (dataRows[0][c] || "") : "";
                    if (/^0x[0-9a-fA-F]{40}$/i.test(sample.trim())) {
                        autoCol = c;
                        break;
                    }
                }
            }

            // Build column picker
            var opts = "";
            headers.forEach(function(h, idx) {
                var sample = dataRows.length > 0 ? (dataRows[0][idx] || "") : "";
                var sel = idx === autoCol ? " selected" : "";
                opts += '<option value="' + idx + '"' + sel + '>' + h + " (e.g. " + sample.slice(0, 24) + ")</option>";
            });

            var html = '<div style="margin-top:12px">' +
                '<p style="font-size:12px;color:var(--text-dim);margin-bottom:8px">Parsed <strong>' +
                formatNumber(dataRows.length) + '</strong> rows with <strong>' + headers.length + '</strong> columns</p>' +
                '<div class="form-group"><label>Select the column containing wallet addresses</label>' +
                '<select id="csvColPick">' + opts + '</select></div>';

            // Show preview table (first 5 rows)
            var previewCount = Math.min(5, dataRows.length);
            html += '<p style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Preview (first ' + previewCount + ' rows):</p>';
            html += '<div class="table-wrap"><table style="font-size:11px"><thead><tr>';
            headers.forEach(function(h) { html += "<th>" + h + "</th>"; });
            html += "</tr></thead><tbody>";
            for (var r = 0; r < previewCount; r++) {
                html += "<tr>";
                headers.forEach(function(h, ci) {
                    var v = dataRows[r][ci] || "";
                    html += '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + v.replace(/"/g, '&quot;') + '">' + v + "</td>";
                });
                html += "</tr>";
            }
            html += "</tbody></table></div>";
            html += '<button class="btn btn-primary" onclick="WalletsPage.importCsv()" style="margin-top:12px">Import ' +
                formatNumber(dataRows.length) + ' Rows</button></div>';

            preview.innerHTML = html;
        };
        reader.readAsText(file);
    },

    _parseCsvLine: function(line) {
        var result = [];
        var current = "";
        var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    result.push(current.trim());
                    current = "";
                } else {
                    current += ch;
                }
            }
        }
        result.push(current.trim());
        return result;
    },

    importCsv: async function() {
        var name = document.getElementById("walletListName").value.trim();
        var desc = document.getElementById("walletListDesc").value.trim();
        if (!name) return toast("List Name is required", "error");
        if (!WalletsPage._csvData || WalletsPage._csvData.length === 0) return toast("No CSV data parsed", "error");

        var colPick = document.getElementById("csvColPick");
        var colIdx = Number(colPick.value);

        // Extract addresses from selected column
        var addresses = [];
        WalletsPage._csvData.forEach(function(row) {
            var val = (row[colIdx] || "").trim();
            if (val) addresses.push(val);
        });

        if (addresses.length === 0) return toast("No values found in selected column", "error");

        // Import in batches of 5000 to avoid payload issues
        var BATCH = 5000;
        var totalImported = 0;
        var totalMatched = 0;
        var batches = Math.ceil(addresses.length / BATCH);

        try {
            for (var b = 0; b < batches; b++) {
                var chunk = addresses.slice(b * BATCH, (b + 1) * BATCH);
                var batchName = batches > 1 ? name + " (Part " + (b + 1) + ")" : name;
                var res = await API.post("/api/wallets/import", {
                    name: batchName,
                    description: desc,
                    addresses: chunk
                });
                totalImported += res.imported || 0;
                totalMatched += res.matched || 0;
            }
            toast("Imported " + formatNumber(totalImported) + " addresses, " + formatNumber(totalMatched) + " matched", "success");
            WalletsPage._csvData = null;
            WalletsPage._csvColumns = null;
            App.navigate("wallets");
        } catch (e) {
            toast(e.error || "Import failed", "error");
        }
    },

    importList: async function() {
        var name = document.getElementById("walletListName").value.trim();
        var desc = document.getElementById("walletListDesc").value.trim();
        var raw = document.getElementById("walletAddresses").value.trim();
        if (!name) return toast("Name required", "error");
        if (!raw) return toast("Paste addresses", "error");
        var addresses = raw.split(/[\n,\s]+/).map(function(a) { return a.trim(); }).filter(Boolean);
        if (addresses.length === 0) return toast("No addresses found", "error");
        try {
            var res = await API.post("/api/wallets/import", { name: name, description: desc, addresses: addresses });
            toast("Imported " + res.imported + " addresses, " + res.matched + " matched", "success");
            App.navigate("wallets");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    viewList: async function(id, name) {
        var data = await API.get("/api/wallets/lists/" + id + "/addresses?limit=50");
        var addrs = data.addresses || [];
        var rows = "";
        addrs.forEach(function(a) {
            rows += "<tr>" +
                '<td title="' + a.address + '">' + truncAddr(a.address) + "</td>" +
                "<td>" + (a.derivationIndex != null ? a.derivationIndex : "\u2014") + "</td>" +
                "<td>" + (a.isMatched ? badge("Matched", "green") : badge("Unmatched", "red")) + "</td>" +
                "</tr>";
        });
        var el = document.getElementById("walletListDetail");
        if (el) {
            el.innerHTML = '<div class="card"><h2>' + name + " \u2013 Addresses (showing " + addrs.length + " of " + data.total + ")</h2>" +
                '<div class="table-wrap"><table>' +
                "<thead><tr><th>Address</th><th>HD Index</th><th>Status</th></tr></thead>" +
                "<tbody>" + rows + "</tbody>" +
                "</table></div></div>";
        }
        WalletsPage._currentListId = id;
        WalletsPage._currentListName = name;
    },

    remove: async function(id) {
        if (!confirm("Delete this wallet list and all its addresses?")) return;
        try {
            await API.del("/api/wallets/lists/" + id);
            toast("Deleted", "success");
            App.navigate("wallets");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },
};