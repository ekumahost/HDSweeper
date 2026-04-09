// Key Derivation page
var KeysPage = {
    pollTimer: null,
    _page: 1,
    _search: "",

    render: async function() {
        var data = await API.get("/api/keys/status");
        var isRunning = data.status === "running";
        var isPaused = data.status === "paused";
        var maxIndex = data.maxIndex || 0;
        var currentIndex = data.currentIndex || 0;
        var totalStored = data.totalStored || 0;
        var matchedCount = data.matchedCount || 0;
        var pct = maxIndex > 0 ? Math.round((currentIndex / maxIndex) * 100) : 0;

        var html = '<div class="card"><h2>HD Key Derivation</h2>' +
            '<p style="color:var(--text-dim);font-size:12px;margin-bottom:12px">' +
            "Derive child addresses from your mnemonic using BIP-44 path m/44\'/60\'/0\'/0/{index}. " +
            "Keys are stored in the database and matched against imported wallet lists." +
            "</p>" +
            '<div class="stats-row">' +
            '<div class="stat-box"><div class="value">' + formatNumber(totalStored) + '</div><div class="label">Keys Stored</div></div>' +
            '<div class="stat-box"><div class="value" style="color:var(--green)">' + formatNumber(matchedCount) + '</div><div class="label">Matched</div></div>' +
            '<div class="stat-box"><div class="value">' +
            (isRunning ? '<span class="status-running">Running</span>' : isPaused ? '<span class="status-paused">Paused</span>' : '<span style="color:var(--text-dim)">Idle</span>') +
            '</div><div class="label">Status</div></div>' +
            "</div>";

        if (isRunning) {
            html += '<div class="progress-bar"><div class="fill" style="width:' + pct + '%"></div></div>' +
                '<p style="font-size:12px;color:var(--text-dim);text-align:center">' + pct + "% \u2013 " + formatNumber(currentIndex) + " / " + formatNumber(maxIndex) + "</p>" +
                '<div class="btn-group"><button class="btn btn-danger" onclick="KeysPage.pause()"><span class="spinner"></span> Pause</button></div>';
            KeysPage.startPolling();
        } else {
            KeysPage.stopPolling();
            html += '<div class="form-row" style="margin-top:16px">' +
                '<div class="form-group"><label>Max Derivation Index</label><input id="keyMaxIndex" type="number" value="200000" min="1" /></div>' +
                "</div>" +
                '<div class="btn-group">' +
                '<button class="btn btn-primary" onclick="KeysPage.start()">' + (totalStored > 0 ? "Resume" : "Start") + " Derivation</button>" +
                (totalStored > 0 ? ' <button class="btn btn-danger" onclick="KeysPage.reset()">Reset All Keys</button>' : "") +
                "</div>";
        }

        html += "</div>";

        // Derived keys list section
        if (totalStored > 0) {
            html += '<div class="card"><h2>Derived Keys</h2>' +
                '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">' +
                '<input id="keySearch" type="text" placeholder="Search by address or index..." ' +
                'value="' + KeysPage._search.replace(/"/g, '&quot;') + '" ' +
                'style="flex:1" onkeydown="if(event.key===\'Enter\'){KeysPage.doSearch()}" />' +
                '<button class="btn btn-primary btn-sm" onclick="KeysPage.doSearch()">Search</button>' +
                '<button class="btn btn-sm" onclick="KeysPage.clearSearch()">Clear</button>' +
                '</div>' +
                '<div id="keysTableWrap">Loading...</div>' +
                '</div>';
        }

        return html;
    },

    afterRender: function() {
        KeysPage.loadKeys();
    },

    loadKeys: async function() {
        var wrap = document.getElementById("keysTableWrap");
        if (!wrap) return;
        try {
            var qs = "?page=" + KeysPage._page + "&limit=50";
            if (KeysPage._search) qs += "&search=" + encodeURIComponent(KeysPage._search);
            var data = await API.get("/api/keys/list" + qs);
            var keys = data.keys || [];
            if (keys.length === 0) {
                wrap.innerHTML = emptyState(KeysPage._search ? "No keys match your search" : "No derived keys yet");
                return;
            }
            var rows = "";
            keys.forEach(function(k) {
                rows += "<tr>" +
                    '<td style="font-family:monospace;font-size:12px">' + k.derivationIndex + "</td>" +
                    '<td style="font-family:monospace;font-size:12px" title="' + k.address + '">' + k.address + "</td>" +
                    "<td>" + new Date(k.createdAt).toLocaleDateString() + "</td>" +
                    '<td>' +
                    '<button class="btn btn-sm" onclick="KeysPage.copyAddr(\'' + k.address + '\')" title="Copy address">Copy</button> ' +
                    '<button class="btn btn-sm" onclick="KeysPage.viewBalances(\'' + k.address + '\')" title="Check balances">Bal</button>' +
                    '</td>' +
                    "</tr>";
            });
            var html = '<div class="table-wrap"><table>' +
                "<thead><tr><th>Index</th><th>Address</th><th>Created</th><th></th></tr></thead>" +
                "<tbody>" + rows + "</tbody></table></div>";
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
                '<span style="font-size:12px;color:var(--text-dim)">' + formatNumber(data.total) + " keys total</span>" +
                pagination(data.page, data.totalPages, "KeysPage.goPage") +
                '</div>';
            wrap.innerHTML = html;
        } catch (e) {
            wrap.innerHTML = '<p style="color:var(--red)">Failed to load keys</p>';
        }
    },

    doSearch: function() {
        var el = document.getElementById("keySearch");
        KeysPage._search = el ? el.value.trim() : "";
        KeysPage._page = 1;
        KeysPage.loadKeys();
    },

    clearSearch: function() {
        KeysPage._search = "";
        KeysPage._page = 1;
        var el = document.getElementById("keySearch");
        if (el) el.value = "";
        KeysPage.loadKeys();
    },

    goPage: function(p) {
        KeysPage._page = p;
        KeysPage.loadKeys();
    },

    copyAddr: function(addr) {
        navigator.clipboard.writeText(addr).then(function() {
            toast("Copied " + addr.slice(0, 10) + "…", "success");
        }).catch(function() {
            toast("Copy failed", "error");
        });
    },

    viewBalances: function(addr) {
        BalancesPage._address = addr;
        BalancesPage._data = null;
        App.navigate("balances");
        setTimeout(function() { BalancesPage.lookup(); }, 100);
    },

    start: async function() {
        var maxIndex = Number(document.getElementById("keyMaxIndex").value);
        if (maxIndex < 1) return toast("Max index must be >= 1", "error");
        try {
            await API.post("/api/keys/start", { maxIndex: maxIndex });
            toast("Derivation started", "success");
            App.navigate("keys");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    pause: async function() {
        try {
            await API.post("/api/keys/pause", {});
            toast("Pausing...", "info");
            setTimeout(function() { App.navigate("keys"); }, 1000);
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    reset: async function() {
        if (!confirm("Delete ALL derived keys? This cannot be undone.")) return;
        try {
            await API.del("/api/keys/reset");
            toast("Keys deleted", "success");
            App.navigate("keys");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    startPolling: function() {
        if (KeysPage.pollTimer) return;
        KeysPage.pollTimer = setInterval(function() {
            if (App.currentPage === "keys") App.navigate("keys");
        }, 3000);
    },

    stopPolling: function() {
        if (KeysPage.pollTimer) {
            clearInterval(KeysPage.pollTimer);
            KeysPage.pollTimer = null;
        }
    },
};