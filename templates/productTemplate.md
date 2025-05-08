<!-- markdownlint-disable MD041 -->
<h2>Description</h2>

${description}

<h2>Linked L1 Capabilities</h2>

<table>
    <thead>
        <tr>
            <th>L1 Capability</th>
        </tr>
    </thead>
    <tbody>
        ${tableRows}
    </tbody>
</table>

<h2>Product Container Diagram</h2>
<ac:image ac:align="center">
  <ri:attachment ri:filename="${containerDiagram}" />
</ac:image>

<h2>Product Data Domain</h2>

<p>The data domain to which the product is significantly aligned.</p>

${domain}

<h2>Product Domain Entities</h2>

<p>The core objects of the data domain that are authored by the product</p>

${rootEntity}
