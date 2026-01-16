import { render, screen } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  render(<App />);
test('renders game title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Type Racer Pro/i);
  expect(titleElement).toBeInTheDocument();
});
  expect(linkElement).toBeInTheDocument();
});
