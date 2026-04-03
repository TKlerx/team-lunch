import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNickname } from '../../src/client/hooks/useNickname.js';

describe('useNickname', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no nickname in localStorage', () => {
    const { result } = renderHook(() => useNickname());
    expect(result.current.nickname).toBeNull();
  });

  it('reads existing nickname from team_lunch_nickname key', () => {
    localStorage.setItem('team_lunch_nickname', 'Alice');
    const { result } = renderHook(() => useNickname());
    expect(result.current.nickname).toBe('Alice');
  });

  it('updateNickname saves to localStorage and updates state', () => {
    const { result } = renderHook(() => useNickname());
    act(() => {
      result.current.updateNickname('Bob');
    });
    expect(result.current.nickname).toBe('Bob');
    expect(localStorage.getItem('team_lunch_nickname')).toBe('Bob');
  });

  it('trims whitespace from nickname', () => {
    const { result } = renderHook(() => useNickname());
    act(() => {
      result.current.updateNickname('  Carol  ');
    });
    expect(result.current.nickname).toBe('Carol');
    expect(localStorage.getItem('team_lunch_nickname')).toBe('Carol');
  });

  it('rejects empty nickname after trimming', () => {
    const { result } = renderHook(() => useNickname());
    act(() => {
      result.current.updateNickname('   ');
    });
    expect(result.current.nickname).toBeNull();
  });

  it('rejects nickname longer than 30 characters', () => {
    const { result } = renderHook(() => useNickname());
    act(() => {
      result.current.updateNickname('a'.repeat(31));
    });
    expect(result.current.nickname).toBeNull();
  });

  it('accepts nickname exactly 30 characters', () => {
    const { result } = renderHook(() => useNickname());
    const name = 'a'.repeat(30);
    act(() => {
      result.current.updateNickname(name);
    });
    expect(result.current.nickname).toBe(name);
  });

  it('clearNickname removes from localStorage and resets state', () => {
    localStorage.setItem('team_lunch_nickname', 'Eve');
    const { result } = renderHook(() => useNickname());
    expect(result.current.nickname).toBe('Eve');
    act(() => {
      result.current.clearNickname();
    });
    expect(result.current.nickname).toBeNull();
    expect(localStorage.getItem('team_lunch_nickname')).toBeNull();
  });

  it('rename updates localStorage but does not change past server data', () => {
    localStorage.setItem('team_lunch_nickname', 'OldName');
    const { result } = renderHook(() => useNickname());
    act(() => {
      result.current.updateNickname('NewName');
    });
    // We only test the client side — server data is unaffected by design
    expect(result.current.nickname).toBe('NewName');
    expect(localStorage.getItem('team_lunch_nickname')).toBe('NewName');
  });
});
