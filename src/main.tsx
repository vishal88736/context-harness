import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import 'highlight.js/styles/github-dark.css';
import './styles.css';
import { App } from './App';

class Boundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="fatal"><h1>Something interrupted the workspace.</h1><p>Your conversations are saved locally.</p><pre>{this.state.error}</pre><button onClick={() => location.reload()}>Reload workspace</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><App /></Boundary></React.StrictMode>);
