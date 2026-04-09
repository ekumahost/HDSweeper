// Gas Wallet page
var GasPage = {
    render: async function () {
        var data = {};
        try { data = await API.get("/api/gas"); } catch (e) {}
        var gw = data.wallet;

        if (!gw) {
            return '<div class="card">' +
                "<h2>Gas Wallet Setup</h2>" +
                '<p style="color:var(--text-dim);font-size:12px;margin-bottom:12px">' +
                    "Select an HD derivation index to use as the gas funder wallet. " +
                    "Fund this wallet with native tokens on each chain you want to sweep." +
                "</p>" +
                '<div class="form-row"><div class="form-group">' +
                    "<label>Derivation Index</label>" +
                    '<input id="gasIndex" type="number" value="0" min="0" />' +
                "</div></div>" +
                '<button class="btn btn-primary" onclick="GasPage.setIndex()">Set Gas Wallet</button>' +
            "</div>";
        }

        var rows = "";
        (gw.balances || []).forEach(function (b) {
            var balF = parseFloat(b.balanceFormatted || 0);
            var color = balF > 0 ? "var(--green)" : "var(--red)";
            var checked = b.lastChecked ? new Date(b.lastChecked).toLocaleString() : "\u2014";
            rows += "<tr><td>" + b.chainName + "</td><td>" + b.chainId + "</td>" +
                '<td style="color:' + color + '">' + balF.toFixed(6) + "</td>" +
                '<td style="color:var(--text-dim)">' + checked + "</td></tr>";
        });

        return '<div class="card"><h2>Gas Wallet</h2>' +
            '<div class="stats-row">' +
                '<div class="stat-box"><div class="value mono" style="font-size:13px">' + gw.address + '</div><div class="label">Address</div></div>' +
                '<div class="stat-box"><div class="value">' + gw.derivationIndex + '</div><div class="label">HD Index</div></div>' +
            "</div></div>" +
            '<div class="card"><h2>Chain Balances</h2>' +
            '<div class="table-wrap"><table>' +
                "<thead><tr><th>Chain</th><th>Chain ID</th><th>Balance</th><th>Last Checked</th></tr></thead>" +
                "<tbody>" + (rows || '<tr><td colspan="4" class="empty">No balances yet</td></tr>') + "</tbody>" +
            "</table></div>" +
            '<div class="btn-group">' +
                '<button class="btn btn-primary" onclick="GasPage.refresh()">Refresh Balances</button>' +
                '<button class="btn btn-danger" onclick="GasPage.reset()">Change Wallet</button>' +
            "</div></div>";
    },

    setIndex: async function () {
        var idx = Number(document.getElementById("gasIndex").value);
        try {
            await API.post("/api/gas/set-index", { index: idx });
            toast("Gas wallet set", "success");
            App.navigate("gas");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    refresh: async function () {
        try {
            toast("Refreshing balances...", "info");
            await API.post("/api/gas/refresh", {});
            toast("Balances updated", "success");
            App.navigate("gas");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    reset: async function () {
        if (!confirm("Change gas wallet? Current one will be removed.")) return;
        try {
            await API.del("/api/gas");
            toast("Gas wallet removed", "success");
            App.navigate("gas");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },
};
