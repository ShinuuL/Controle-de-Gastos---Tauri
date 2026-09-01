package com.controle_gastos.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

/**
 * Entrega o APK baixado ao instalador do sistema (fase 21).
 *
 * Existe em Kotlin porque **nao ha instalacao sem Android**: quem exibe o
 * dialogo de confirmacao e o PackageInstaller, e chegar nele exige Intent,
 * FileProvider e a permissao de "instalar apps desconhecidos". Instalacao
 * silenciosa so e possivel para app de sistema ou device owner (MDM), que nao e
 * o caso -- entao **quem confirma e sempre o usuario**, e isso e um recurso, nao
 * uma limitacao a contornar.
 *
 * A verificacao do arquivo NAO acontece aqui. Assinatura Ed25519 do manifesto e
 * sha256 do APK sao conferidos no Rust (`update.rs`) antes de este plugin
 * receber qualquer caminho; este lado so entrega ao sistema o que ja passou.
 */
@InvokeArg
class InstalarArgs {
  lateinit var caminho: String
}

@TauriPlugin
class InstaladorPlugin(private val activity: Activity) : Plugin(activity) {

  /**
   * O usuario ja liberou "instalar apps desconhecidos" para o Contr0l?
   *
   * Abaixo do Android 8 a permissao era global do aparelho, e nao por app; ali
   * a resposta e sempre "sim" e quem decide continua sendo o dialogo do sistema.
   */
  @Command
  fun podeInstalar(invoke: Invoke) {
    val permitido = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      activity.packageManager.canRequestPackageInstalls()
    } else {
      true
    }
    val resposta = JSObject()
    resposta.put("permitido", permitido)
    invoke.resolve(resposta)
  }

  /**
   * Abre a tela do sistema onde a permissao e concedida.
   *
   * Nao ha como conceder por codigo, e nem deveria haver. O app so leva o
   * usuario ate la; a interface precisa ter explicado antes por que essa tela
   * vai aparecer.
   */
  @Command
  fun pedirPermissao(invoke: Invoke) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      invoke.resolve()
      return
    }
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${activity.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(intent)
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject("Nao foi possivel abrir a tela de permissao do sistema.", "permissao_indisponivel", e)
    }
  }

  /**
   * Entrega o arquivo ao instalador do sistema.
   *
   * O caminho vira `content://` pelo FileProvider: desde o Android 7 passar um
   * `file://` para outro app lanca `FileUriExposedException`, e o instalador
   * roda em outro processo. A permissao de leitura viaja com a Intent e morre
   * com ela -- nada do app fica exposto depois.
   */
  @Command
  fun instalar(invoke: Invoke) {
    val args = invoke.parseArgs(InstalarArgs::class.java)
    val arquivo = File(args.caminho)
    if (!arquivo.exists()) {
      invoke.reject("O arquivo da atualizacao nao esta mais no aparelho.", "arquivo_ausente")
      return
    }

    try {
      val uri = FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.fileprovider",
        arquivo
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject("O sistema recusou abrir o instalador.", "instalador_recusou", e)
    }
  }
}
