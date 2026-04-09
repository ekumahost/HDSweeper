// Sweep Jobs page
var SweepPage = {
    pollTimer: null,

    buildJobsHTML: function(jobs) {
        var rows = "";
        var hasRunning = false;

        jobs.forEach(function(j) {
            var pct = j.totalWallets > 0 ? Math.round((j.processedWallets / j.totalWallets) * 100) : 0;
            var source = "";
            if (j.mode === "range" && j.fromIndex === j.toIndex) {
                source = "Single #" + (j.fromIndex || 0);
            } else if (j.mode === "range") {
                source = "Index " + (j.fromIndex || 0) + " \u2013 " + (j.toIndex || 0);
            } else {
                source = (j.listId && j.listId.name) ? j.listId.name : "\u2014";
            }
            if (j.status === "running") hasRunning = true;

            var runClass = j.status === "running" ? " running" : "";
            var badgeExtra = j.status === "running" ? '<span class="badge badge-green pulse">running</span>' : statusBadge(j.status);

            rows += "<tr>" +
                "<td>" + source + "</td>" +
                "<td>" + badgeExtra + "</td>" +
                "<td>" +
                '<div class="progress-bar' + runClass + '" style="min-width:80px"><div class="fill" style="width:' + pct + '%"></div></div>' +
                '<span style="font-size:11px;color:var(--text-dim)">' + pct + "%</span>" +
                "</td>" +
                "<td>" + formatNumber(j.processedWallets) + " / " + formatNumber(j.totalWallets) + "</td>" +
                '<td style="color:var(--green)">' + (j.totalTxSent || 0) + "</td>" +
                '<td style="color:var(--red)">' + (j.totalTxFailed || 0) + "</td>" +
                "<td>" + (j.targetChainIds || []).join(", ") + "</td>" +
                "<td>";

            if (j.status === "pending" || j.status === "paused" || j.status === "gas_depleted") {
                rows += '<button class="btn btn-sm btn-primary" onclick="SweepPage.start(\'' + j._id + '\')">Start</button> ';
            }
            if (j.status === "running") {
                rows += '<button class="btn btn-sm btn-danger" onclick="SweepPage.pause(\'' + j._id + '\')">Pause</button> ';
            }
            rows += '<button class="btn btn-sm" onclick="SweepPage.viewLogs(\'' + j._id + '\')">Logs</button> ';
            if (j.status !== "running") {
                rows += '<button class="btn btn-sm btn-danger" onclick="SweepPage.remove(\'' + j._id + '\')">Del</button>';
            }
            rows += "</td></tr>";
        });

        return { rows: rows, hasRunning: hasRunning, count: jobs.length };
    },

    buildAlertsHTML: function(jobs) {
        var alerts = "";
        jobs.forEach(function(j) {
            if (j.status === "gas_depleted") {
                var pending = (j.totalWallets || 0) - (j.processedWallets || 0);
                alerts += '<div class="card" style="border-color:var(--orange)">' +
                    '<h2 style="color:var(--orange)">\u26A0 Gas Depleted</h2>' +
                    '<p style="color:var(--text-dim);font-size:13px">' + (j.pauseReason || "Gas funder ran out of funds") + "</p>" +
                    '<p style="font-size:12px;margin-top:6px"><span style="color:var(--green)">' + (j.processedWallets || 0) + ' done</span> \u2022 <span style="color:var(--orange)">' + pending + ' pending</span> \u2022 <span style="color:var(--green)">' + (j.totalTxSent || 0) + ' tx ok</span> \u2022 <span style="color:var(--red)">' + (j.totalTxFailed || 0) + ' tx failed</span></p>' +
                    '<p style="color:var(--text-dim);font-size:12px;margin-top:4px">Fund the gas wallet and click <b>Resume</b> to continue.</p></div>';
            }
            if (j.status === "paused") {
                var pending2 = (j.totalWallets || 0) - (j.processedWallets || 0);
                alerts += '<div class="card" style="border-color:var(--accent)">' +
                    '<h2 style="color:var(--accent)">\u23F8 Job Paused</h2>' +
                    '<p style="color:var(--text-dim);font-size:13px">' + (j.pauseReason || "Paused by user") + "</p>" +
                    '<p style="font-size:12px;margin-top:6px"><span style="color:var(--green)">' + (j.processedWallets || 0) + ' done</span> \u2022 <span style="color:var(--accent)">' + pending2 + ' pending</span></p>' +
                    '<p style="color:var(--text-dim);font-size:12px;margin-top:4px">Click <b>Resume</b> to continue from where it stopped.</p></div>';
            }
            if (j.status === "failed") {
                alerts += '<div class="card" style="border-color:var(--red)">' +
                    '<h2 style="color:var(--red)">\u2716 Job Failed</h2>' +
                    '<p style="color:var(--text-dim);font-size:13px">' + (j.pauseReason || "Unknown error") + "</p>" +
                    '<p style="color:var(--text-dim);font-size:12px;margin-top:4px">Fix the issue and click <b>Resume</b> to retry.</p></div>';
            }
            if (j.status === "completed" && j.pauseReason) {
                alerts += '<div class="card" style="border-color:var(--green)">' +
                    '<h2 style="color:var(--green)">\u2714 Completed with Notes</h2>' +
                    '<p style="color:var(--text-dim);font-size:13px">' + j.pauseReason + "</p>" +
                    '<p style="font-size:12px;margin-top:6px"><span style="color:var(--green)">' + (j.totalTxSent || 0) + ' tx ok</span> \u2022 <span style="color:var(--red)">' + (j.totalTxFailed || 0) + ' tx failed</span></p></div>';
            }
        });
        return alerts;
    },

    refreshJobs: async function() {
        try {
            var data = await API.get("/api/sweep/jobs");
            var jobs = data.jobs || [];
            var built = SweepPage.buildJobsHTML(jobs);
            var alertsEl = document.getElementById("sweepAlerts");
            var tableBody = document.getElementById("sweepJobsBody");
            var countEl = document.getElementById("sweepJobCount");
            if (alertsEl) alertsEl.innerHTML = SweepPage.buildAlertsHTML(jobs);
            if (tableBody) tableBody.innerHTML = built.rows || '<tr><td colspan="8">' + emptyState("No sweep jobs") + "</td></tr>";
            if (countEl) countEl.textContent = built.count;
            if (built.hasRunning) SweepPage.startPolling();
            else SweepPage.stopPolling();
        } catch (e) { /* silently skip polling errors */ }
    },

    render: async function() {
        var data = await API.get("/api/sweep/jobs");
        var jobs = data.jobs || [];
        var built = SweepPage.buildJobsHTML(jobs);

        if (built.hasRunning) SweepPage.startPolling();
        else SweepPage.stopPolling();

        var alerts = SweepPage.buildAlertsHTML(jobs);

        return '<div id="sweepAlerts">' + alerts + '</div>' +
            '<div class="card"><h2>Create Sweep Job</h2>' +
            '<div class="form-group"><label>Source Mode</label>' +
            '<div style="display:flex;gap:8px;margin-bottom:8px">' +
            '<button class="btn btn-primary btn-sm" id="modeListBtn" onclick="SweepPage.setMode(\'list\')">Wallet List</button>' +
            '<button class="btn btn-sm" id="modeRangeBtn" onclick="SweepPage.setMode(\'range\')">Index Range</button>' +
            '<button class="btn btn-sm" id="modeSingleBtn" onclick="SweepPage.setMode(\'single\')">Single Wallet</button>' +
            '</div></div>' +
            '<div id="sweepModeList">' +
            '<div class="form-group"><label>Wallet List</label><select id="sweepListId"><option value="">Loading...</option></select></div>' +
            '</div>' +
            '<div id="sweepModeRange" style="display:none">' +
            '<div class="form-row">' +
            '<div class="form-group"><label>From Index</label><input type="number" id="sweepFromIndex" value="0" min="0" placeholder="0" /></div>' +
            '<div class="form-group"><label>To Index</label><input type="number" id="sweepToIndex" value="1000" min="0" placeholder="200000" /></div>' +
            '</div>' +
            '<p style="font-size:11px;color:var(--text-dim);margin:-6px 0 8px">Derives all HD wallets in this index range and sweeps them directly.</p>' +
            '</div>' +
            '<div id="sweepModeSingle" style="display:none">' +
            '<div class="form-group"><label>Wallet Index or Address</label>' +
            '<input id="sweepSingleInput" placeholder="e.g. 42 or 0xABC..." /></div>' +
            '<p style="font-size:11px;color:var(--text-dim);margin:-6px 0 8px">Enter an HD index (number) or wallet address (0x...) to sweep one wallet.</p>' +
            '</div>' +
            '<div class="form-group"><label>Chains <span style="font-weight:normal;color:var(--text-dim)">(none selected = all active chains)</span></label>' +
            '<div id="sweepChains" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">Loading chains...</div></div>' +
            '<button class="btn btn-primary" onclick="SweepPage.create()">Create Job</button>' +
            "</div>" +
            '<div class="card"><h2>Sweep Jobs (<span id="sweepJobCount">' + built.count + "</span>)</h2>" +
            '<div class="table-wrap"><table>' +
            "<thead><tr><th>Source</th><th>Status</th><th>Progress</th><th>Wallets</th><th>OK</th><th>Fail</th><th>Chains</th><th>Actions</th></tr></thead>" +
            '<tbody id="sweepJobsBody">' + (built.rows || '<tr><td colspan="8">' + emptyState("No sweep jobs") + "</td></tr>") + "</tbody>" +
            "</table></div></div>" +
            '<div id="sweepLogsDetail"></div>';
    },

    setMode: function(mode) {
        var listDiv = document.getElementById("sweepModeList");
        var rangeDiv = document.getElementById("sweepModeRange");
        var singleDiv = document.getElementById("sweepModeSingle");
        var listBtn = document.getElementById("modeListBtn");
        var rangeBtn = document.getElementById("modeRangeBtn");
        var singleBtn = document.getElementById("modeSingleBtn");
        listDiv.style.display = "none";
        rangeDiv.style.display = "none";
        if (singleDiv) singleDiv.style.display = "none";
        listBtn.className = "btn btn-sm";
        rangeBtn.className = "btn btn-sm";
        if (singleBtn) singleBtn.className = "btn btn-sm";
        if (mode === "range") {
            rangeDiv.style.display = "block";
            rangeBtn.className = "btn btn-primary btn-sm";
        } else if (mode === "single") {
            if (singleDiv) singleDiv.style.display = "block";
            if (singleBtn) singleBtn.className = "btn btn-primary btn-sm";
        } else {
            listDiv.style.display = "block";
            listBtn.className = "btn btn-primary btn-sm";
        }
        SweepPage._mode = mode;
    },

    _mode: "list",

    afterRender: async function() {
        SweepPage._mode = "list";
        try {
            var data = await API.get("/api/wallets/lists");
            var sel = document.getElementById("sweepListId");
            if (sel) {
                var opts = '<option value="">\u2014 Select wallet list \u2014</option>';
                (data.lists || []).forEach(function(l) {
                    opts += '<option value="' + l._id + '">' + l.name + " (" + (l.matchedAddresses || 0) + " matched)</option>";
                });
                sel.innerHTML = opts;
            }
        } catch (e) {}
        try {
            var rpcData = await API.get("/api/rpcs");
            var chainBox = document.getElementById("sweepChains");
            if (chainBox) {
                var seen = {};
                var html = "";
                (rpcData.rpcs || []).forEach(function(r) {
                    if (!r.isActive || seen[r.chainId]) return;
                    seen[r.chainId] = true;
                    var cid = "chain_" + r.chainId;
                    html += '<label for="' + cid + '" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;' +
                        'padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;user-select:none">' +
                        '<input type="checkbox" id="' + cid + '" value="' + r.chainId + '" style="accent-color:var(--accent)" />' +
                        r.chainName + ' <span style="color:var(--text-dim);font-size:11px">(' + r.chainId + ')</span></label>';
                });
                chainBox.innerHTML = html || '<span style="color:var(--text-dim);font-size:13px">No active chains</span>';
            }
        } catch (e) {}
    },

    create: async function() {
        var chainBox = document.getElementById("sweepChains");
        var checks = chainBox ? chainBox.querySelectorAll('input[type="checkbox"]:checked') : [];
        var chainIds = [];
        for (var i = 0; i < checks.length; i++) {
            chainIds.push(Number(checks[i].value));
        }
        chainIds = chainIds.filter(Boolean);

        var payload = { chainIds: chainIds };

        if (SweepPage._mode === "single") {
            var val = document.getElementById("sweepSingleInput").value.trim();
            if (!val) return toast("Enter an index or address", "error");
            if (val.startsWith("0x") || val.startsWith("0X")) {
                if (val.length !== 42) return toast("Invalid address (must be 42 chars)", "error");
                payload.singleAddress = val;
            } else {
                var idx = parseInt(val, 10);
                if (isNaN(idx) || idx < 0) return toast("Invalid index", "error");
                payload.fromIndex = idx;
                payload.toIndex = idx;
            }
        } else if (SweepPage._mode === "range") {
            var from = parseInt(document.getElementById("sweepFromIndex").value, 10);
            var to = parseInt(document.getElementById("sweepToIndex").value, 10);
            if (isNaN(from) || isNaN(to) || from < 0 || to < from) {
                return toast("Invalid index range. To must be >= From and both >= 0", "error");
            }
            payload.fromIndex = from;
            payload.toIndex = to;
        } else {
            var listId = document.getElementById("sweepListId").value;
            if (!listId) return toast("Select a wallet list", "error");
            payload.listId = listId;
        }

        try {
            await API.post("/api/sweep/jobs", payload);
            toast("Sweep job created", "success");
            SweepPage.refreshJobs();
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    start: async function(id) {
        try {
            await API.post("/api/sweep/jobs/" + id + "/start", {});
            toast("Sweep started", "success");
            App.navigate("sweep");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    pause: async function(id) {
        try {
            await API.post("/api/sweep/jobs/" + id + "/pause", {});
            toast("Pause requested", "info");
            setTimeout(function() { App.navigate("sweep"); }, 1500);
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    viewLogs: async function(jobId) {
        try {
            var data = await API.get("/api/sweep/jobs/" + jobId + "/logs?limit=50");
            var logs = data.logs || [];
            var rows = "";
            logs.forEach(function(l) {
                rows += "<tr>" +
                    "<td>" + l.type + "</td>" +
                    "<td>" + l.chainId + "</td>" +
                    '<td title="' + l.walletAddress + '">' + truncAddr(l.walletAddress) + "</td>" +
                    "<td>" + (l.tokenSymbol || "Native") + "</td>" +
                    "<td>" + (l.amountFormatted || "\u2014") + "</td>" +
                    "<td>" + statusBadge(l.status) + "</td>" +
                    '<td title="' + (l.txHash || "") + '">' + (l.txHash ? truncAddr(l.txHash) : "\u2014") + "</td>" +
                    '<td style="color:var(--red);font-size:11px">' + (l.error || "") + "</td>" +
                    "</tr>";
            });
            var el = document.getElementById("sweepLogsDetail");
            if (el) {
                el.innerHTML = '<div class="card"><h2>Job Logs (showing ' + logs.length + " of " + data.total + ")</h2>" +
                    '<div class="table-wrap"><table>' +
                    "<thead><tr><th>Type</th><th>Chain</th><th>Wallet</th><th>Token</th><th>Amount</th><th>Status</th><th>Tx Hash</th><th>Error</th></tr></thead>" +
                    "<tbody>" + (rows || '<tr><td colspan="8">' + emptyState("No logs yet") + "</td></tr>") + "</tbody>" +
                    "</table></div></div>";
            }
        } catch (e) { toast(e.error || "Failed to load logs", "error"); }
    },

    remove: async function(id) {
        if (!confirm("Delete this sweep job and its logs?")) return;
        try {
            await API.del("/api/sweep/jobs/" + id);
            toast("Deleted", "success");
            SweepPage.refreshJobs();
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    startPolling: function() {
        if (SweepPage.pollTimer) return;
        SweepPage.pollTimer = setInterval(function() {
            if (App.currentPage === "sweep") SweepPage.refreshJobs();
        }, 5000);
    },

    stopPolling: function() {
        if (SweepPage.pollTimer) {
            clearInterval(SweepPage.pollTimer);
            SweepPage.pollTimer = null;
        }
    },
};