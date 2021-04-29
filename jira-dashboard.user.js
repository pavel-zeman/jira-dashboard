// ==UserScript==
// @name         JIRA CaMS dashboard
// @namespace    https://github.com/pavel-zeman
// @version      0.1
// @description  JIRA CaMS dashboards
// @author       Pavel Zeman
// @match        https://jira.unicorn.com/secure/Dashboard.jspa*
// @grant        none
// ==/UserScript==

(async function() {
  'use strict';

  function parseKktr(value) {
    if (value) {
      value = value.replace(",", ".");
      return Math.round(parseFloat(value) * 3600);
    } else {
      return 0;
    }
  }

  function formatHours(value) {
    value /= 3600;
    return Math.round(value).toString();
  }

  function recalculateSize() {
    let recalculated = false;
    document.querySelectorAll("iframe").forEach( item => {
      const body = item.contentWindow.document.body;
      if (body.textContent.indexOf("##") === 0) {
        // Wait for load
        setTimeout(recalculateSize, 1000);
      } else {
        const nodes = body.querySelectorAll("#sprintOverview");
        if (nodes.length === 1) {
          const height = nodes[0].getBoundingClientRect().height;
          item.style.height = `${height + 10}px`;
          item.parentElement.parentElement.style.height = `${height + 35}px`;
          recalculated = true;
        }
      }
    });
    if (recalculated) {
      document.querySelectorAll("div.gadget").forEach( item => {
        //if (item.querySelectorAll("iframe").length > 0) {
          const previous = item.previousSibling;
          if (previous && previous.className && previous.className.indexOf("gadget") >= 0 && previous.offsetTop < item.offsetTop) {
            const previousHeight = previous.getBoundingClientRect().height
            item.style.top = `${previous.offsetTop + previousHeight + 20}px`;
          }
        //}
      });
    }
  }

  // Find all gadgets ready to be populated
  const body = document.body;
  if (body.querySelectorAll("div#page").length > 0) {
    setTimeout(recalculateSize, 2000);
  } else if (body.textContent.indexOf("##") === 0) {
    const component = body.textContent.substring(2, body.textContent.indexOf("##", 2));
    const response = await (await fetch(`/rest/api/latest/search?jql=project=cams%20and%20component=${component}%20and%20issuetype=sub-task%20and%20cf[12001]%20is%20not%20empty%20order%20by%20key&startAt=0&maxResults=10000`)).json();

    const phaseMap = {};

    for(let issue of response.issues) {
      let fields = issue.fields;
      let phase = fields.customfield_12001;
      let item = phaseMap[phase];
      if (!item) {
        item = phaseMap[phase] = { phase: phase[0], kktr: 0, originalEstimate: 0, remainingEstimate: 0, logged: 0 };
      }

      item.kktr += parseKktr(fields.customfield_17113);
      item.originalEstimate += fields.timeoriginalestimate
      item.remainingEstimate += fields.timeestimate;
      item.logged += fields.timespent;
    }

    const phases = Object.values(phaseMap).sort((a, b) => a.phase.localeCompare(b.phase));
    let html = `
<table id="sprintOverview" width="100%">
  <tr>
    <th>Sprint</th>
    <th>KKTR</th>
    <th>Original estimate</th>
    <th>Logged</th>
    <th>Remaining</th>
    <th>Diff</th>
  </tr>
`;
    let totalKktr = 0;
    let totalOriginalEstimate = 0;
    let totalLogged = 0;
    let totalRemainingEstimate = 0;
    const padding = "style='padding: 4px'";
    for(const item of phases) {
      let spent = item.remainingEstimate + item.logged;
      totalKktr += item.kktr;
      totalOriginalEstimate += item.originalEstimate;
      totalLogged += item.logged;
      totalRemainingEstimate += item.remainingEstimate;
      html += `
  <tr style="background:${spent > item.kktr ? '#FFB8C0' : '#B8E0C0'}; text-align: right;">
    <td ${padding} align="center"><a style="text-decoration:none" href="/issues/?jql=project=cams and cf[12001]=${item.phase} and issuetype=sub-task">${item.phase}</a></td>
    <td ${padding}>${formatHours(item.kktr)}</td>
    <td ${padding}>${formatHours(item.originalEstimate)}</td>
    <td ${padding}>${formatHours(item.logged)}</td>
    <td ${padding}>${formatHours(item.remainingEstimate)}</td>
    <td ${padding}>${formatHours(item.kktr - spent)}</td>
  </tr>
  `;
    }

    html += `
  <tr style="text-align: right;">
    <th ${padding} align="center">Total</th>
    <th ${padding}>${formatHours(totalKktr)}</th>
    <th ${padding}>${formatHours(totalOriginalEstimate)}</th>
    <th ${padding}>${formatHours(totalLogged)}</th>
    <th ${padding}>${formatHours(totalRemainingEstimate)}</th>
    <th ${padding}>${formatHours(totalKktr - totalLogged - totalRemainingEstimate)}</th>
  </tr>`;

    html += "</table>";
    body.innerHTML = html;
  }
})();