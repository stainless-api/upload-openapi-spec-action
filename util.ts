import { spawn, SpawnOptions } from 'child_process';

export async function runCmd(cmd: string, args: string[], options: SpawnOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, options);

    let out = '';
    proc.stdout?.on('data', (data) => {
      data = data.toString();
      console.log(data);
      out += data;
    });

    let err = '';
    proc.stderr?.on('data', (data) => {
      data = data.toString();
      console.error(data);
      err += data;
    });

    proc.on('close', (code) => {
      if (code === 0) resolve(out);

      const error = new Error(err);
      Object.assign(error, { code });
      reject(error);
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}
