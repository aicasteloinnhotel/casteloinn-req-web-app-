/**
 * Imprimir um PDF gerado no app.
 *
 * No computador o PDF vai para um quadro escondido e a janela de impressão
 * abre direto em cima do app, sem a aba nova do navegador. No celular o
 * navegador não imprime de um quadro escondido: abre o PDF numa aba, como antes.
 */

import type { jsPDF } from "jspdf";

const ID_DO_QUADRO = "quadro-de-impressao";

function ehCelular(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
}

export function imprimirPdf(doc: jsPDF): void {
  if (ehCelular()) {
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
    return;
  }

  // O quadro da impressão anterior só sai agora: removê-lo logo depois do
  // print() fecharia a janela de impressão no meio.
  const anterior = document.getElementById(ID_DO_QUADRO) as HTMLIFrameElement | null;
  if (anterior) {
    URL.revokeObjectURL(anterior.src);
    anterior.remove();
  }

  const quadro = document.createElement("iframe");
  quadro.id = ID_DO_QUADRO;
  quadro.setAttribute("aria-hidden", "true");
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  quadro.onload = () => {
    try {
      quadro.contentWindow?.focus();
      quadro.contentWindow?.print();
    } catch {
      window.open(quadro.src, "_blank");
    }
  };
  quadro.src = URL.createObjectURL(doc.output("blob"));
  document.body.appendChild(quadro);
}
