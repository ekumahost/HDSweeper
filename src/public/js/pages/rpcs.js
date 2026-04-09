// RPC Management page
var RpcsPage = {
    _rpcs: [],

    render: async function() {
        var data = await API.get("/api/rpcs");
        var rpcs = data.rpcs || [];
        RpcsPage._rpcs = rpcs;

        var rows = "";
        rpcs.forEach(function(r) {
            rows += "<tr>" +
                "<td>" + r.chainName + "</td>" +
                "<td>" + r.chainId + "</td>" +
                '<td title="' + r.url + '" style="max-width:300px;overflow:hidden;text-overflow:ellipsis">' + r.url + "</td>" +
                "<td>" + (r.nativeSymbol || "") + "</td>" +
                "<td>" + (r.latencyMs ? r.latencyMs + "ms" : "\u2014") + "</td>" +
                "<td>" + (r.isActive ? badge("Active", "green") : badge("Inactive", "red")) + "</td>" +
                "<td>" +
                '<button class="btn btn-sm" onclick="RpcsPage.test(\'' + r._id + '\')">' + 'Test</button> ' +
                '<button class="btn btn-sm" onclick="RpcsPage.toggle(\'' + r._id + "\', " + !r.isActive + ')">' + (r.isActive ? "Disable" : "Enable") + "</button> " +
                '<button class="btn btn-sm btn-danger" onclick="RpcsPage.remove(\'' + r._id + '\')">' + 'Del</button>' +
                "</td></tr>";
        });

        return '<div class="card"><h2>Add RPC Endpoint</h2>' +
            '<div class="form-row">' +
            '<div class="form-group"><label>Chain ID</label><input id="rpcChainId" type="number" placeholder="e.g. 1" /></div>' +
            '<div class="form-group"><label>Chain Name</label><input id="rpcChainName" placeholder="e.g. Ethereum" /></div>' +
            "</div>" +
            '<div class="form-row">' +
            '<div class="form-group"><label>RPC URL</label><input id="rpcUrl" placeholder="https://..." /></div>' +
            '<div class="form-group"><label>Native Symbol</label><input id="rpcSymbol" placeholder="e.g. ETH" /></div>' +
            "</div>" +
            '<div class="form-group"><label>Explorer URL (optional)</label><input id="rpcExplorer" placeholder="https://etherscan.io" /></div>' +
            '<button class="btn btn-primary" onclick="RpcsPage.add()">Add RPC</button>' +
            "</div>" +
            '<div class="card"><h2>RPC Endpoints (' + rpcs.length + ")</h2>" +
            '<div class="table-wrap"><table>' +
            "<thead><tr><th>Chain</th><th>ID</th><th>URL</th><th>Native</th><th>Latency</th><th>Status</th><th>Actions</th></tr></thead>" +
            "<tbody>" + (rows || '<tr><td colspan="7">' + emptyState("No RPCs. Defaults are seeded on first boot.") + "</td></tr>") + "</tbody>" +
            "</table></div></div>";
    },

    add: async function() {
        var chainId = Number(document.getElementById("rpcChainId").value);
        var chainName = document.getElementById("rpcChainName").value.trim();
        var url = document.getElementById("rpcUrl").value.trim();
        var nativeSymbol = document.getElementById("rpcSymbol").value.trim();
        var explorerUrl = document.getElementById("rpcExplorer").value.trim();
        if (!chainId || !chainName || !url) return toast("Chain ID, name, and URL required", "error");
        try {
            await API.post("/api/rpcs", { chainId: chainId, chainName: chainName, url: url, nativeSymbol: nativeSymbol, explorerUrl: explorerUrl });
            toast("RPC added", "success");
            App.navigate("rpcs");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    test: async function(id) {
        var rpc = RpcsPage._rpcs.find(function(r) { return r._id === id; });
        if (!rpc) return toast("RPC not found", "error");
        try {
            toast("Testing...", "info");
            var res = await API.post("/api/rpcs/test", { url: rpc.url });
            if (res.ok) {
                toast("OK \u2013 latency " + res.latencyMs + "ms, chain " + res.chainId, "success");
            } else {
                toast("Failed: " + (res.error || "Unknown"), "error");
            }
            App.navigate("rpcs");
        } catch (e) { toast(e.error || "Connection failed", "error"); }
    },

    toggle: async function(id, isActive) {
        try {
            await API.put("/api/rpcs/" + id, { isActive: isActive });
            App.navigate("rpcs");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    remove: async function(id) {
        if (!confirm("Delete RPC?")) return;
        try {
            await API.del("/api/rpcs/" + id);
            toast("Deleted", "success");
            App.navigate("rpcs");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },
};