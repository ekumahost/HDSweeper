// Shared UI components

function toast(message, type) {
    type = type || "info";
    var el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.textContent = message;
    document.getElementById("toast-container").appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
}

function badge(text, color) {
    return '<span class="badge badge-' + color + '">' + text + "</span>";
}

function statusBadge(status) {
    var map = {
        running: "green",
        active: "green",
        success: "green",
        idle: "purple",
        completed: "blue",
        paused: "orange",
        pending: "orange",
        failed: "red",
        error: "red",
        gas_depleted: "red",
        skipped: "gray",
    };
    return badge(status, map[status] || "gray");
}

function pagination(current, totalPages, onChange) {
    if (totalPages <= 1) return "";
    var html = '<div class="pagination">';
    html += '<button class="btn btn-sm" ' + (current <= 1 ? "disabled" : "") + " onclick=\"" + onChange + "(" + (current - 1) + ')\">Prev</button>';
    html += '<span style="color:var(--text-dim);font-size:12px">Page ' + current + " of " + totalPages + "</span>";
    html += '<button class="btn btn-sm" ' + (current >= totalPages ? "disabled" : "") + " onclick=\"" + onChange + "(" + (current + 1) + ')\">Next</button>';
    html += "</div>";
    return html;
}

function emptyState(message) {
    return '<div class="empty">' + message + "</div>";
}

function truncAddr(addr) {
    if (!addr) return "\u2014";
    return addr.slice(0, 8) + "\u2026" + addr.slice(-6);
}

function formatNumber(n) {
    return Number(n).toLocaleString();
}
