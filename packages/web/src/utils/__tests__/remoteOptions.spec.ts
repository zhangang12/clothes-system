import { describe, it, expect, vi } from 'vitest';
import { useRemoteOptions, listParams } from '../remoteOptions';

describe('listParams', () => {
  it('UT-RO-01: 有关键词才带 keyword——空串会让后端变成 LIKE %% 全表扫', () => {
    expect(listParams('M502')).toEqual({ page: 1, size: 100, keyword: 'M502' });
    expect(listParams('')).toEqual({ page: 1, size: 100 });
  });

  it('UT-RO-02: 条数可调（默认 100）', () => {
    expect(listParams('x', 20)).toMatchObject({ size: 20 });
  });
});

describe('useRemoteOptions', () => {
  it('UT-RO-03: 搜索把关键词透传给后端——这正是「本地过滤」漏掉的那一步', async () => {
    const fetch = vi.fn().mockResolvedValue([{ id: 1 }]);
    const { search, options } = useRemoteOptions<any>({ fetch });
    await search('15081');
    expect(fetch).toHaveBeenCalledWith('15081');
    expect(options.value).toEqual([{ id: 1 }]);
  });

  it('UT-RO-04: 关键词前后空格要去掉，否则 LIKE 里带着空格永远搜不到', async () => {
    const fetch = vi.fn().mockResolvedValue([]);
    const { search } = useRemoteOptions<any>({ fetch });
    await search('  M502  ');
    expect(fetch).toHaveBeenCalledWith('M502');
  });

  it('UT-RO-05: 空输入照样去后端拿默认那批，而不是留着上一次的搜索结果', async () => {
    const fetch = vi.fn().mockResolvedValue([]);
    const { search } = useRemoteOptions<any>({ fetch });
    await search('');
    expect(fetch).toHaveBeenCalledWith('');
  });

  it('UT-RO-06: 搜索出错时保留上一批——清空会把已选中的那条也抹掉，下拉退化成裸 id', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce([{ id: 7, name: '已选中的那条' }])
      .mockRejectedValueOnce(new Error('网络断了'));
    const { search, options } = useRemoteOptions<any>({ fetch });
    await search('');
    await search('炸');
    expect(options.value).toEqual([{ id: 7, name: '已选中的那条' }]);
  });

  it('UT-RO-07: loading 起落成对，出错也要落下来（否则下拉一直转圈）', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('x'));
    const { search, loading } = useRemoteOptions<any>({ fetch });
    const p = search('a');
    expect(loading.value).toBe(true);
    await p;
    expect(loading.value).toBe(false);
  });
});
