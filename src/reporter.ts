import * as fs from 'fs/promises';
import { createObjectCsvWriter } from 'csv-writer';
import { Graph } from './grapher';

export async function reportGraph(graph: Graph, outPath: string, pretty: boolean): Promise<void> {
  const jsonReport = graph.toJSON();
  const jsonString = JSON.stringify(jsonReport, null, pretty ? 2 : 0);
  await fs.writeFile(`${outPath}.json`, jsonString);

  const csvWriter = createObjectCsvWriter({
    path: `${outPath}.csv`,
    header: [
      { id: 'from', title: 'From' },
      { id: 'to', title: 'To' },
    ],
  });

  const records = graph.edges.map(([from, to]) => ({ from, to }));
  await csvWriter.writeRecords(records);
}

