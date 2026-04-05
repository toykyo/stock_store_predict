export async function insertBatchRun(client, run) {
  await client.query(
    `
      insert into batch_run_log (
        run_id, mode, trade_date, started_at, finished_at, status, step_count, notes
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (run_id) do update
      set finished_at = excluded.finished_at,
          status = excluded.status,
          step_count = excluded.step_count,
          notes = excluded.notes
    `,
    [
      run.run_id,
      run.mode,
      run.trade_date,
      run.started_at,
      run.finished_at,
      run.status,
      run.step_count,
      run.notes,
    ],
  );
}

export async function insertBatchStep(client, runId, step) {
  await client.query(
    `
      insert into batch_step_log (
        run_id, step_name, step_order, status, started_at, finished_at, notes
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (run_id, step_name) do update
      set status = excluded.status,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          notes = excluded.notes
    `,
    [
      runId,
      step.step_name,
      step.step_order,
      step.status,
      step.started_at,
      step.finished_at,
      step.notes,
    ],
  );
}
