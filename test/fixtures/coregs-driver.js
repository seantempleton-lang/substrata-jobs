// Isolated SQL-driver fixture. No network or live CORE-GS connection is used.
const points = [
  { CLNT_ID: "Geotechnical", PROJ_ID: "302670", POINT_ID: "BH5049", Type: "Borehole", HoleDepth: 0, Location: "Local test point", Sort: 1 },
  { CLNT_ID: "Geotechnical", PROJ_ID: "302670", POINT_ID: "BH5050", Type: "Borehole", HoleDepth: null, Location: "Local test point", Sort: 2 },
  { CLNT_ID: "Geotechnical", PROJ_ID: "302684", POINT_ID: "WB-03", Type: "Borehole", HoleDepth: 0, Location: "Local test point", Sort: 1 },
  { CLNT_ID: "Other client", PROJ_ID: "302670", POINT_ID: "WRONG-CLIENT", Sort: 1 },
  { CLNT_ID: "Geotechnical", PROJ_ID: "OTHER", POINT_ID: "WRONG-PROJECT", Sort: 1 },
];
class ConnectionPool {
  constructor(config) {
    if (config.server !== "fixture-coregs") throw new Error("Fixture driver must only use fixture configuration.");
  }
  async connect() { return this; }
  async close() {}
  request() {
    const inputs = {};
    return { input(name, _type, value) { inputs[name] = value; return this; }, async query(text) {
      if (!/^SELECT\s+POINT_ID, Type, HoleDepth, Location\s+FROM dbo\.POINT\s+WHERE CLNT_ID = @CLNT_ID AND PROJ_ID = @PROJ_ID\s+ORDER BY COALESCE\(Sort, 2147483647\), POINT_ID;$/i.test(text.trim()))
        throw new Error("Unexpected SQL in read-only CORE-GS fixture.");
      return { recordset: points.filter(point => point.CLNT_ID === inputs.CLNT_ID && point.PROJ_ID === inputs.PROJ_ID)
        .sort((a, b) => (a.Sort ?? 2147483647) - (b.Sort ?? 2147483647) || a.POINT_ID.localeCompare(b.POINT_ID)) };
    } };
  }
}
export default { ConnectionPool, NVarChar: length => length };
