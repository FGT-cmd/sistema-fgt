import { describe, it, expect } from "vitest";
import {
  parseStatementDate, parseStatementAmount, parseOfx, parseCsv, detectAccount, toStatementRows,
  decodeStatementText,
} from "./statement";

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910120000[-3:BRT]<TRNAMT>-39.90<FITID>A1<MEMO>PIX ENVIADO MFIT LTDA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260911<TRNAMT>1800.00<FITID>A2<MEMO>PIX RECEBIDO ALESKA DA ROSA</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>4230.15<DTASOF>20260930</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("parse de campos", () => {
  it("datas em vários formatos", () => {
    expect(parseStatementDate("2026-09-03")).toBe("2026-09-03");
    expect(parseStatementDate("03/09/2026")).toBe("2026-09-03");
    expect(parseStatementDate("20260903120000[-3:BRT]")).toBe("2026-09-03");
    expect(parseStatementDate("ontem")).toBeNull();
  });
  it("valores BR, americanos e negativos", () => {
    expect(parseStatementAmount("1.234,56")).toBe(1234.56);
    expect(parseStatementAmount("-39,90")).toBe(-39.9);
    expect(parseStatementAmount("R$ -1.800,00")).toBe(-1800);
    expect(parseStatementAmount("39.90")).toBe(39.9);
    expect(parseStatementAmount("1.800")).toBe(1800);
    expect(parseStatementAmount("−50,00")).toBe(-50);
    expect(parseStatementAmount("")).toBeNull();
  });
  it("separadores inequívocos", () => {
    expect(parseStatementAmount("1,234.56")).toBe(1234.56);
    expect(parseStatementAmount("-1,234.56")).toBe(-1234.56);
    expect(parseStatementAmount("0.500")).toBe(0.5);
    expect(parseStatementAmount("1e3")).toBeNull();
  });
});

describe("parseOfx", () => {
  it("lê transações e saldo final", () => {
    const p = parseOfx(OFX);
    expect(p.rows).toEqual([
      { date: "2026-09-10", amount: -39.9, description: "PIX ENVIADO MFIT LTDA", fitId: "A1" },
      { date: "2026-09-11", amount: 1800, description: "PIX RECEBIDO ALESKA DA ROSA", fitId: "A2" },
    ]);
    expect(p.ledgerBalance).toEqual({ amount: 4230.15, date: "2026-09-30" });
    expect(p.isCard).toBe(false);
  });
});

describe("parseOfx amounts", () => {
  it("TRNAMT é sempre ponto decimal", () => {
    const p = parseOfx("<STMTTRN><DTPOSTED>20260910<TRNAMT>1234.567<FITID>Z</STMTTRN>");
    expect(p.rows[0].amount).toBe(1234.567);
  });
});

describe("parseCsv", () => {
  it("Nubank conta (Data,Valor,Identificador,Descrição)", () => {
    const p = parseCsv("Data,Valor,Identificador,Descrição\n10/09/2026,-57.00,abc,Compra no débito - OpenAI\n");
    expect(p.rows).toEqual([{ date: "2026-09-10", amount: -57, description: "Compra no débito - OpenAI" }]);
    expect(p.invertSign).toBe(false);
  });
  it("Nubank fatura (date,title,amount): compra positiva vira saída", () => {
    const p = parseCsv("date,title,amount\n2026-09-15,Meta Ads,1094.67\n");
    expect(p.isCard).toBe(true);
    expect(p.invertSign).toBe(true);
    expect(toStatementRows(p, "Nubank PF")[0].amount).toBe(-1094.67);
  });
  it("CSV com ponto e vírgula, aspas e valor BR", () => {
    const p = parseCsv('﻿Data;Descrição;Valor\n"03/09/2026";"PIX ENVIADO; CONTADORA";"-407,29"\n');
    expect(p.rows).toEqual([{ date: "2026-09-03", amount: -407.29, description: "PIX ENVIADO; CONTADORA" }]);
  });
  it("colunas separadas de entrada e saída", () => {
    const p = parseCsv("Data;Histórico;Entrada;Saída\n01/09/2026;Pix;;100,00\n02/09/2026;Pix;250,00;\n");
    expect(p.rows.map((r) => r.amount)).toEqual([-100, 250]);
  });
});

describe("conta e ids", () => {
  it("detecta o banco pelo nome do arquivo ou conteúdo", () => {
    expect(detectAccount("extrato-c6-setembro.ofx", "")).toBe("C6");
    expect(detectAccount("Nubank_2026-09.csv", "")).toBe("Nubank PF");
    expect(detectAccount("extrato.ofx", "<ORG>Banco C6 S.A.")).toBe("C6");
    expect(detectAccount("extrato.csv", "Data,Valor")).toBeNull();
  });
  it("externalId usa o FITID e numera linhas idênticas sem FITID", () => {
    expect(toStatementRows(parseOfx(OFX), "C6")[0].externalId).toBe("C6|fit|A1");
    const p = parseCsv("Data;Descrição;Valor\n03/09/2026;Café;-27,10\n03/09/2026;Café;-27,10\n");
    const ids = toStatementRows(p, "C6").map((r) => r.externalId);
    expect(ids).toEqual(["C6|2026-09-03|-27.10|cafe#1", "C6|2026-09-03|-27.10|cafe#2"]);
  });
  it("decodifica latin1 quando o arquivo não é utf-8", () => {
    const b64 = Buffer.from("Descrição", "latin1").toString("base64");
    expect(decodeStatementText(b64)).toBe("Descrição");
  });
});
