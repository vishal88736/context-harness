import type { ChildProcess } from "node:child_process";
export function windowsSystemFile(...parts: string[]): string;
export const powershellBinary: string;
export function powershellArguments(script: string): string[];
export function terminateWindowsTree(child: ChildProcess): void;
