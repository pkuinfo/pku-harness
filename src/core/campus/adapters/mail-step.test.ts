/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { loginStep } from './mail-step';

describe('loginStep', () => {
  test('SMS page (relative Location from domainEntLogin)', () => {
    const s = loginStep('/static/login/sms/index.html?hl=zh_CN&uid=2000000001@stu.pku.edu.cn&domain=stu.pku.edu.cn&account_name=2000000001&mobile=138****1234&ruid=2600000001@stu.pku.edu.cn');
    expect(s).toEqual({ kind: 'sms', url: 'https://mailh.qiye.163.com/static/login/sms/index.html?hl=zh_CN&uid=2000000001@stu.pku.edu.cn&domain=stu.pku.edu.cn&account_name=2000000001&mobile=138****1234&ruid=2600000001@stu.pku.edu.cn', account: '2000000001', mobile: '138****1234' });
  });

  test('signed in: sid and the mail host from the jump URL', () => {
    expect(loginStep('https://mailshz.qiye.163.com/static/sirius-web/jump/index.html?sid=90KAS8m*Hu&from=login&hl=zh_CN')).toEqual({ kind: 'done', sid: '90KAS8m*Hu', host: 'mailshz.qiye.163.com' });
  });

  test('anything else is a failed login', () => {
    expect(loginStep(undefined)).toEqual({ kind: 'failed' });
    expect(loginStep('https://mail.stu.pku.edu.cn/?errorType=460')).toEqual({ kind: 'failed' });
    expect(loginStep('https://evil.example.com/x?sid=1')).toEqual({ kind: 'failed' });
  });
});
